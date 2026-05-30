// 채용 사이트 화면에서 공고 후보를 추출하고 공통 공고 모델로 정규화한다.
import type { Browser, Page } from "playwright";
import type { SiteConfig } from "../config.js";
import { extractDateRange, kstDateStamp } from "../date.js";
import { buildContentHash, buildPostingId } from "../hash.js";
import type { CompanyName, JobPosting, SourceStatus } from "../model.js";

export type CandidateBlock = {
  text: string;
  url: string;
  urlIsPageFallback?: boolean;
};

export type ScrapeOutput = {
  postings: JobPosting[];
  status: SourceStatus;
};

const DATE_TOKEN_PATTERN_SOURCE = String.raw`20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}(?:일)?`;
const DATE_LINE_PATTERN = new RegExp(DATE_TOKEN_PATTERN_SOURCE);
const DATE_RANGE_PATTERN = new RegExp(`${DATE_TOKEN_PATTERN_SOURCE}\\s*[-~〜–—]\\s*${DATE_TOKEN_PATTERN_SOURCE}`, "g");
const D_DAY_LINE_PATTERN = /^\s*D-\s*\d+\s*$/i;
const D_DAY_TEXT_PATTERN = /(?:^|\n)\s*D-\s*(\d+)\s*(?=\n|$)/i;
const UI_LABEL_PATTERN = /^(공유|스크랩|삭제|검색|초기화)$/;
const NO_ACTIVE_POSTINGS_PATTERN = /0\s*개의?\s*채용\s*공고|총\s*0\s*건/;
const LOAD_MORE_TEXT_PATTERN = /더보기|더 보기|More|MORE|Load more|전체보기|결과 더 보기/i;
const CAREER_LABEL_PATTERN = /^\s*(?:[\[【(]\s*)?경력(?:직)?(?:\s*[\]】)])?(?=$|[\s:：\-|])/;
const ZERO_POSTING_RETRY_COUNT = 5;

export function parseCandidateBlocks(
  site: SiteConfig,
  blocks: CandidateBlock[],
  checkedAt: string,
): JobPosting[] {
  const postings: JobPosting[] = [];
  const seenIds = new Set<string>();

  for (const block of blocks) {
    if (!hasRequiredKeywords(block.text, site.requiredKeywords)) continue;
    if (hasExcludedKeyword(block.text, site.excludedKeywords)) continue;

    const posting = normalizeBlock(site, block, checkedAt);
    if (!posting || seenIds.has(posting.id)) continue;

    seenIds.add(posting.id);
    postings.push(posting);
  }

  return postings;
}

export async function scrapeGenericCareerPage(
  browser: Browser,
  site: SiteConfig,
  checkedAt: string,
): Promise<ScrapeOutput> {
  let page: Page | null = null;

  try {
    page = await browser.newPage({
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
    });
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("body", { timeout: 10_000 });
    await page.waitForSelector(getCandidateSelector(), { timeout: 5_000 }).catch(() => undefined);
    await clickLoadMore(page);
    await waitForPostingSignals(page, site);

    const { blocks, postings } = await collectParsedPostings(page, site, checkedAt);
    if (postings.length === 0) {
      return {
        postings: [],
        status: buildZeroPostingStatus(site, blocks, await readBodyText(page), checkedAt),
      };
    }

    return {
      postings,
      status: {
        source: site.source,
        ok: true,
        checkedAt,
        postingCount: postings.length,
      },
    };
  } catch (error) {
    return {
      postings: [],
      status: {
        source: site.source,
        ok: false,
        checkedAt,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    await page?.close().catch(() => undefined);
  }
}

async function collectParsedPostings(
  page: Page,
  site: SiteConfig,
  checkedAt: string,
): Promise<{ blocks: CandidateBlock[]; postings: JobPosting[] }> {
  let blocks: CandidateBlock[] = [];
  let postings: JobPosting[] = [];

  for (let attempt = 0; attempt <= ZERO_POSTING_RETRY_COUNT; attempt += 1) {
    blocks = await collectCandidateBlocks(page);
    const bodyText = await readBodyText(page);
    blocks = mergeCandidateBlocks(blocks, collectLineBasedCandidateBlocks(site, bodyText, page.url()));
    postings = parseCandidateBlocks(site, blocks, checkedAt);
    if (postings.length > 0) break;

    if (attempt === ZERO_POSTING_RETRY_COUNT || !shouldRetryZeroPostingParse(site, bodyText)) {
      break;
    }

    await page.waitForTimeout(1_000);
  }

  return { blocks, postings };
}

function mergeCandidateBlocks(primary: CandidateBlock[], fallback: CandidateBlock[]): CandidateBlock[] {
  const seen = new Set(primary.map((block) => buildCandidateBlockKey(block)));

  for (const block of fallback) {
    const key = buildCandidateBlockKey(block);
    if (seen.has(key)) continue;
    seen.add(key);
    primary.push(block);
  }

  return primary;
}

function buildCandidateBlockKey(block: CandidateBlock): string {
  return `${block.text}|${block.url}|${block.urlIsPageFallback ? "fallback" : "link"}`;
}

function collectLineBasedCandidateBlocks(site: SiteConfig, bodyText: string, pageUrl: string): CandidateBlock[] {
  const url = normalizeHttpUrl(pageUrl);
  if (!url) return [];

  const companyMarkers = buildSiteCompanyMarkers(site);
  if (companyMarkers.length === 0) return [];

  const lines = bodyText
    .split(/\n+/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  const blocks: CandidateBlock[] = [];

  for (let index = 0; index < lines.length - 2; index += 1) {
    if (!companyMarkers.some((marker) => lines[index] === marker)) continue;

    const blockLines = lines.slice(index, index + 8);
    if (!looksLikeLineBasedPosting(blockLines, site.requiredKeywords)) continue;

    blocks.push({
      text: blockLines.join("\n"),
      url,
      urlIsPageFallback: true,
    });
  }

  return blocks;
}

function looksLikeLineBasedPosting(lines: string[], requiredKeywords: string[]): boolean {
  const titleLine = lines[1] ?? "";
  if (titleLine.length < 4 || isMetadataLine(titleLine) || DATE_LINE_PATTERN.test(titleLine)) return false;
  if (!lines.slice(2, 4).some((line) => D_DAY_LINE_PATTERN.test(line) || DATE_LINE_PATTERN.test(line))) return false;

  return hasRequiredKeywords(lines.join("\n"), requiredKeywords);
}

function buildSiteCompanyMarkers(site: SiteConfig): string[] {
  if (site.defaultCompany) return [site.defaultCompany];

  return site.companies.flatMap((company) => [company.name, ...company.aliases]).filter((marker) => marker !== "");
}

async function readBodyText(page: Page): Promise<string> {
  return page.locator("body").innerText({ timeout: 1_000 }).catch(() => "");
}

function shouldRetryZeroPostingParse(site: SiteConfig, bodyText: string): boolean {
  if (!site.defaultCompany) return false;
  if (NO_ACTIVE_POSTINGS_PATTERN.test(bodyText)) return false;
  return hasRequiredKeywords(bodyText, site.requiredKeywords);
}

function buildZeroPostingStatus(
  site: SiteConfig,
  blocks: CandidateBlock[],
  bodyText: string,
  checkedAt: string,
): SourceStatus {
  if (NO_ACTIVE_POSTINGS_PATTERN.test(bodyText)) {
    return {
      source: site.source,
      ok: true,
      checkedAt,
      postingCount: 0,
    };
  }

  if (blocks.length === 0) {
    return {
      source: site.source,
      ok: false,
      checkedAt,
      message: "No candidate posting blocks were found.",
    };
  }

  const relevantBlocks = blocks.filter(
    (block) =>
      hasRequiredKeywords(block.text, site.requiredKeywords) && !hasExcludedKeyword(block.text, site.excludedKeywords),
  );
  if (relevantBlocks.length === 0) {
    return {
      source: site.source,
      ok: true,
      checkedAt,
      postingCount: 0,
    };
  }

  if (!site.defaultCompany && relevantBlocks.every((block) => detectCompanies(site, block.text).length === 0)) {
    return {
      source: site.source,
      ok: true,
      checkedAt,
      postingCount: 0,
    };
  }

  return {
    source: site.source,
    ok: false,
    checkedAt,
    message: "Candidate posting blocks were found but no postings could be parsed.",
  };
}

function hasRequiredKeywords(text: string, requiredKeywords: string[]): boolean {
  return requiredKeywords.every((keyword) => keyword === "" || text.includes(keyword));
}

function hasExcludedKeyword(text: string, excludedKeywords: string[]): boolean {
  return excludedKeywords.some((keyword) => keyword !== "" && text.includes(keyword));
}

function normalizeBlock(site: SiteConfig, block: CandidateBlock, checkedAt: string): JobPosting | null {
  const url = normalizeHttpUrl(block.url);
  if (!url) return null;
  const identityUrl = block.urlIsPageFallback ? buildFallbackIdentityUrl(url) : url;

  const companies = detectCompanies(site, block.text);
  if (companies.length !== 1) return null;

  const company = companies[0];
  const titleCandidates = extractTitleCandidates(site, block.text, company);
  if (isAmbiguousDefaultCompanyBlock(site, block.text, titleCandidates)) return null;

  const title = selectTitleCandidate(titleCandidates);
  if (!title) return null;

  const { startDate, endDate: explicitEndDate } = extractDateRange(block.text);
  const endDate = explicitEndDate ?? extractDdayEndDate(block.text, checkedAt);
  const posting: JobPosting = {
    id: buildPostingId(site.source, company, title, identityUrl),
    company,
    title,
    careerType: "career",
    startDate,
    endDate,
    url,
    source: site.source,
    firstSeenAt: checkedAt,
    lastSeenAt: checkedAt,
    contentHash: "",
  };

  return {
    ...posting,
    contentHash: buildContentHash({ ...posting, url: identityUrl }),
  };
}

function detectCompanies(site: SiteConfig, text: string): CompanyName[] {
  if (site.defaultCompany) return [site.defaultCompany];

  const matches: CompanyName[] = [];
  for (const company of site.companies) {
    const names = [company.name, ...company.aliases];
    if (names.some((name) => name !== "" && text.includes(name))) {
      matches.push(company.name);
    }
  }

  return matches;
}

function extractTitleCandidates(site: SiteConfig, text: string, company: CompanyName): string[] {
  const companyMarkers = buildCompanyMarkers(site, company);
  return text
    .split(/\n+/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .map(stripCareerLabel)
    .filter(Boolean)
    .filter((line) => !isMetadataLine(line))
    .filter((line) => !site.requiredKeywords.some((keyword) => keyword !== "" && line === keyword))
    .filter((line) => !DATE_LINE_PATTERN.test(line))
    .filter((line) => !companyMarkers.some((marker) => line.includes(marker)))
    .filter((line) => line.length >= 4 && line.length <= 120);
}

function selectTitleCandidate(titleCandidates: string[]): string | null {
  return titleCandidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

function isAmbiguousDefaultCompanyBlock(site: SiteConfig, text: string, titleCandidates: string[]): boolean {
  if (!site.defaultCompany) return false;

  const dateRangeCount = [...text.matchAll(DATE_RANGE_PATTERN)].length;
  return dateRangeCount > 1 || new Set(titleCandidates).size > 1;
}

function buildCompanyMarkers(site: SiteConfig, company: CompanyName): string[] {
  const matchingRule = site.companies.find((rule) => rule.name === company);
  const companyTokens = company.split(/\s+/).filter((token) => token.length > 2);
  return [company, ...(matchingRule?.aliases ?? []), ...companyTokens].filter((marker) => marker !== "");
}

function isMetadataLine(line: string): boolean {
  const compactLine = line.replace(/\s+/g, "");
  return (
    UI_LABEL_PATTERN.test(line) ||
    D_DAY_LINE_PATTERN.test(line) ||
    line.startsWith("#") ||
    compactLine === "경력채용" ||
    compactLine.endsWith("경력채용") ||
    /^\d{1,2}월경력채용$/.test(compactLine)
  );
}

function stripCareerLabel(line: string): string {
  return line.replace(CAREER_LABEL_PATTERN, "").replace(/^[\s:：\-|]+/, "").trim();
}

function extractDdayEndDate(text: string, checkedAt: string): string | null {
  const match = text.match(D_DAY_TEXT_PATTERN);
  if (!match) return null;

  const daysRemaining = Number(match[1]);
  if (!Number.isInteger(daysRemaining)) return null;

  return addDaysToDateStamp(kstDateStamp(new Date(checkedAt)), daysRemaining);
}

function addDaysToDateStamp(dateStamp: string, days: number): string {
  const [year, month, day] = dateStamp.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function buildFallbackIdentityUrl(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

async function clickLoadMore(page: Page): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    const loadMore = page.getByText(LOAD_MORE_TEXT_PATTERN).first();
    if (!(await loadMore.isVisible().catch(() => false))) return;

    await loadMore.click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
  }
}

async function waitForPostingSignals(page: Page, site: SiteConfig): Promise<void> {
  await page
    .waitForFunction(buildPostingSignalScript(site), undefined, { timeout: 10_000 })
    .catch(() => undefined);
}

function buildPostingSignalScript(site: SiteConfig): string {
  return `
(() => {
  const requiredKeywords = ${JSON.stringify(site.requiredKeywords)};
  const companyMarkers = ${JSON.stringify(buildSiteCompanyMarkers(site))};
  const candidateSelector = ${JSON.stringify(getCandidateSelector())};
  const bodyText = document.body?.innerText || "";
  const hasNoActivePostings = /0\\s*개의?\\s*채용\\s*공고|총\\s*0\\s*건/.test(bodyText);

  function hasRequiredKeywords(text) {
    return requiredKeywords.every((keyword) => keyword === "" || text.includes(keyword));
  }

  function hasDeadlineSignal(text) {
    return /(?:^|\\n)\\s*D-\\s*\\d+\\s*(?=\\n|$)|20\\d{2}[.\\-/년\\s]+\\d{1,2}[.\\-/월\\s]+\\d{1,2}/.test(text);
  }

  const hasCandidatePosting = Array.from(document.querySelectorAll(candidateSelector)).some((element) => {
    const text = element.innerText || "";
    return text.length >= 12 && hasRequiredKeywords(text) && hasDeadlineSignal(text);
  });

  const hasLineBasedPosting =
    companyMarkers.length > 0 &&
    companyMarkers.some((marker) => marker !== "" && bodyText.includes(marker)) &&
    hasRequiredKeywords(bodyText) &&
    hasDeadlineSignal(bodyText);

  return hasNoActivePostings || hasCandidatePosting || hasLineBasedPosting;
})()
`;
}

function getCandidateSelector(): string {
  return [
    "a[href]",
    "li",
    "article",
    "tr",
    "[role='listitem']",
    "[class*='card']",
    "[class*='item']",
    "[class*='job']",
  ].join(",");
}

const COLLECT_CANDIDATE_BLOCKS_SCRIPT = String.raw`
(function () {
  const selectors = [
    "a[href]",
    "li",
    "article",
    "tr",
    "[role='listitem']",
    "[class*='card']",
    "[class*='item']",
    "[class*='job']",
  ].join(",");
  const elements = Array.from(document.querySelectorAll(selectors));
  const seen = new Set();
  const blocks = [];

  function normalizeText(element) {
    return (element.innerText || "")
      .trim()
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  function resolveHttpUrl(value, base) {
    const href = value.trim();
    if (href === "" || href.startsWith("#")) return null;

    try {
      const url = new URL(href, base);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  function validAnchorUrlsIn(element) {
    const anchors = element.matches("a[href]")
      ? [element]
      : Array.from(element.querySelectorAll("a[href]"));
    return anchors
      .map((anchor) => resolveHttpUrl(anchor.getAttribute("href") || "", location.href))
      .filter((url) => url !== null);
  }

  function hasMultiplePostingChildren(element) {
    if (element.matches("a[href]")) return false;

    const anchorUrls = new Set(validAnchorUrlsIn(element));
    if (anchorUrls.size > 1) return true;

    const containerSelectors = [
      "li",
      "article",
      "tr",
      "[role='listitem']",
      "[class*='card']",
      "[class*='item']",
      "[class*='job']",
    ].join(",");
    const children = Array.from(element.querySelectorAll(containerSelectors)).filter((child) => {
      if (child === element || !element.contains(child)) return false;
      const text = normalizeText(child);
      return text.length >= 12 && text.length <= 1200;
    });

    return children.length > 1;
  }

  for (const element of elements) {
    if (hasMultiplePostingChildren(element)) continue;

    const text = normalizeText(element);
    if (text.length < 12 || text.length > 1200) continue;

    const anchorUrls = validAnchorUrlsIn(element);
    const urlIsPageFallback = anchorUrls.length === 0;
    const url = anchorUrls[0] || resolveHttpUrl(location.href, location.href);
    if (!url) continue;

    const key = text + "|" + url;
    if (seen.has(key)) continue;

    seen.add(key);
    blocks.push({ text, url, urlIsPageFallback });
  }

  return blocks;
}())
`;

async function collectCandidateBlocks(page: Page): Promise<CandidateBlock[]> {
  const blocks = await page.evaluate(COLLECT_CANDIDATE_BLOCKS_SCRIPT);
  return blocks as CandidateBlock[];
}
