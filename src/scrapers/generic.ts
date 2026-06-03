// 채용 사이트 화면에서 공고 후보를 추출하고 공통 공고 모델로 정규화한다.
import type { Browser, Locator, Page } from "playwright";
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
const OPEN_UNTIL_FILLED_LINE_PATTERN = /^\s*채용시까지\s*$/;
const UI_LABEL_PATTERN = /^(공유|스크랩|삭제|검색|초기화)$/;
const NO_ACTIVE_POSTINGS_PATTERN = /0\s*개의?\s*채용\s*공고|총\s*0\s*건/;
const LOAD_MORE_TEXT_PATTERN = /더보기|더 보기|More|MORE|Load more|전체보기|결과 더 보기/i;
const NEXT_PAGE_TEXT_PATTERN = /^\s*(?:다음(?:\s*페이지)?|next(?:\s*page)?|>|›|»)\s*$/i;
const PAGINATION_CONTAINER_SELECTOR = [
  "nav",
  "[aria-label*='page' i]",
  "[aria-label*='페이지']",
  "[class*='page' i]",
  "[class*='paging' i]",
  "[class*='pagination' i]",
].join(",");
const PAGINATION_CONTROL_SELECTOR = "button, [role='button'], [onclick], a[href]:not([href^='javascript'])";
const PAGINATION_PAGE_LIMIT = 50;
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

    const { blocks, postings, bodyText } = await collectParsedPostingsAcrossPages(page, site, checkedAt);
    if (postings.length === 0) {
      return {
        postings: [],
        status: buildZeroPostingStatus(site, blocks, bodyText, checkedAt),
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

async function collectParsedPostingsAcrossPages(
  page: Page,
  site: SiteConfig,
  checkedAt: string,
): Promise<{ blocks: CandidateBlock[]; postings: JobPosting[]; bodyText: string }> {
  const blocks: CandidateBlock[] = [];
  const postings: JobPosting[] = [];
  const seenPostingIds = new Set<string>();
  const visitedPages = new Set<string>();
  const bodyTexts: string[] = [];

  await waitForPostingSignals(page, site);
  await goToFirstPage(page);

  for (let pageIndex = 0; pageIndex < PAGINATION_PAGE_LIMIT; pageIndex += 1) {
    await clickLoadMore(page);
    await waitForPostingSignals(page, site);

    const pageKey = await buildPageSignature(page);
    if (visitedPages.has(pageKey)) break;
    visitedPages.add(pageKey);

    const pageResult = await collectParsedPostings(page, site, checkedAt);
    mergeCandidateBlocks(blocks, pageResult.blocks);
    bodyTexts.push(pageResult.bodyText);

    for (const posting of pageResult.postings) {
      if (seenPostingIds.has(posting.id)) continue;
      seenPostingIds.add(posting.id);
      postings.push(posting);
    }

    const beforeNextSignature = await buildPageSignature(page);
    const moved =
      (await goToPageNumber(page, pageIndex + 2, beforeNextSignature)) ||
      (await goToNextPage(page, beforeNextSignature));
    if (!moved) break;

    await page.waitForSelector("body", { timeout: 10_000 }).catch(() => undefined);
    await page.waitForSelector(getCandidateSelector(), { timeout: 5_000 }).catch(() => undefined);
  }

  return { blocks, postings, bodyText: bodyTexts.join("\n") };
}

async function collectParsedPostings(
  page: Page,
  site: SiteConfig,
  checkedAt: string,
): Promise<{ blocks: CandidateBlock[]; postings: JobPosting[]; bodyText: string }> {
  let blocks: CandidateBlock[] = [];
  let postings: JobPosting[] = [];
  let bodyText = "";

  for (let attempt = 0; attempt <= ZERO_POSTING_RETRY_COUNT; attempt += 1) {
    blocks = await collectCandidateBlocks(page);
    bodyText = await readBodyText(page);
    blocks = mergeCandidateBlocks(blocks, collectLineBasedCandidateBlocks(site, bodyText, page.url()));
    postings = parseCandidateBlocks(site, blocks, checkedAt);
    if (postings.length > 0) break;

    if (attempt === ZERO_POSTING_RETRY_COUNT || !shouldRetryZeroPostingParse(site, bodyText)) {
      break;
    }

    await page.waitForTimeout(1_000);
  }

  return { blocks, postings, bodyText };
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
  if (
    !lines
      .slice(2, 4)
      .some(hasDeadlineLine)
  ) {
    return false;
  }

  return hasRequiredKeywords(lines.join("\n"), requiredKeywords);
}

function hasDeadlineLine(line: string): boolean {
  return D_DAY_LINE_PATTERN.test(line) || OPEN_UNTIL_FILLED_LINE_PATTERN.test(line) || DATE_LINE_PATTERN.test(line);
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
      hasRequiredKeywords(block.text, site.requiredKeywords) &&
      hasPostingDeadlineSignal(block.text) &&
      !hasExcludedKeyword(block.text, site.excludedKeywords),
  );
  if (relevantBlocks.length === 0) {
    if (site.defaultCompany && hasUnparsedRequiredPostingWindow(bodyText, site.requiredKeywords)) {
      return {
        source: site.source,
        ok: false,
        checkedAt,
        message: "Required-keyword posting rows were visible but no posting blocks could be parsed.",
      };
    }

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

function hasUnparsedRequiredPostingWindow(bodyText: string, requiredKeywords: string[]): boolean {
  const lines = bodyText
    .split(/\n+/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  for (let index = 0; index < lines.length; index += 1) {
    const windowText = lines.slice(index, index + 8).join("\n");
    if (hasRequiredKeywords(windowText, requiredKeywords) && hasPostingDeadlineSignal(windowText)) {
      return true;
    }
  }

  return false;
}

function normalizeBlock(site: SiteConfig, block: CandidateBlock, checkedAt: string): JobPosting | null {
  const url = normalizeHttpUrl(block.url);
  if (!url) return null;
  if (!hasPostingDeadlineSignal(block.text)) return null;

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

function hasPostingDeadlineSignal(text: string): boolean {
  return (
    D_DAY_TEXT_PATTERN.test(text) ||
    DATE_LINE_PATTERN.test(text) ||
    text.split(/\n+/).some((line) => OPEN_UNTIL_FILLED_LINE_PATTERN.test(line))
  );
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
    OPEN_UNTIL_FILLED_LINE_PATTERN.test(line) ||
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

async function goToFirstPage(page: Page): Promise<void> {
  const currentPageNumber = await detectCurrentPageNumber(page);
  if (!currentPageNumber || currentPageNumber <= 1) return;

  await goToPageNumber(page, 1, await buildPageSignature(page));
}

async function goToPageNumber(page: Page, pageNumber: number, previousSignature: string): Promise<boolean> {
  const pageNumberPattern = new RegExp(`^\\s*${pageNumber}\\s*$`);
  const pageNumberControl = await findUsablePaginationControl([
    page.locator(PAGINATION_CONTAINER_SELECTOR).locator(PAGINATION_CONTROL_SELECTOR).filter({
      hasText: pageNumberPattern,
    }),
  ]);
  if (!pageNumberControl) return false;

  return clickPaginationControl(page, pageNumberControl, previousSignature);
}

async function goToNextPage(page: Page, previousSignature: string): Promise<boolean> {
  const nextPageControl = await findNextPageControl(page);
  if (!nextPageControl) return false;

  return clickPaginationControl(page, nextPageControl, previousSignature);
}

async function clickPaginationControl(page: Page, control: Locator, previousSignature: string): Promise<boolean> {
  await control.scrollIntoViewIfNeeded().catch(() => undefined);
  const clicked = await control.click({ timeout: 3_000 }).then(
    () => true,
    () => false,
  );

  if (clicked && (await waitForPaginationMove(page, previousSignature))) {
    return true;
  }

  const jsClicked = await control.evaluate((element) => {
    if (element instanceof HTMLElement) {
      element.click();
      return true;
    }

    return false;
  }).catch(() => false);

  return jsClicked ? waitForPaginationMove(page, previousSignature) : false;
}

async function waitForPaginationMove(page: Page, previousSignature: string): Promise<boolean> {
  await waitForPageSignatureChange(page, previousSignature);
  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);

  return (await buildPageSignature(page)) !== previousSignature;
}

async function findNextPageControl(page: Page): Promise<Locator | null> {
  return findUsablePaginationControl([
    page.getByRole("link", { name: NEXT_PAGE_TEXT_PATTERN }),
    page.getByRole("button", { name: NEXT_PAGE_TEXT_PATTERN }),
    page.locator(PAGINATION_CONTAINER_SELECTOR).locator(PAGINATION_CONTROL_SELECTOR).filter({
      hasText: NEXT_PAGE_TEXT_PATTERN,
    }),
    await buildNextNumberPageLocator(page),
  ]);
}

async function buildNextNumberPageLocator(page: Page): Promise<Locator> {
  const currentPageNumber = (await detectCurrentPageNumber(page)) ?? 1;
  const nextPageNumberPattern = new RegExp(`^\\s*${currentPageNumber + 1}\\s*$`);
  return page.locator(PAGINATION_CONTAINER_SELECTOR).locator(PAGINATION_CONTROL_SELECTOR).filter({
    hasText: nextPageNumberPattern,
  });
}

async function detectCurrentPageNumber(page: Page): Promise<number | null> {
  const currentPageText = await page
    .locator(PAGINATION_CONTAINER_SELECTOR)
    .locator("[aria-current='page'], [class*='active' i], [class*='current' i], .on")
    .filter({ hasText: /^\s*\d+\s*$/ })
    .first()
    .innerText({ timeout: 500 })
    .catch(() => "");
  const currentPageFromText = parsePositiveInteger(currentPageText);
  if (currentPageFromText) return currentPageFromText;

  return detectCurrentPageNumberFromUrl(page.url());
}

function detectCurrentPageNumberFromUrl(value: string): number | null {
  const url = new URL(value);
  for (const [key, parameterValue] of url.searchParams.entries()) {
    if (!/page|paging|pageNo|pageIndex|currentPage/i.test(key)) continue;

    const pageNumber = parsePositiveInteger(parameterValue);
    if (pageNumber) return pageNumber;
  }

  return null;
}

function parsePositiveInteger(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function findUsablePaginationControl(locators: Locator[]): Promise<Locator | null> {
  for (const locator of locators) {
    const count = Math.min(await locator.count().catch(() => 0), 10);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await isUsablePaginationControl(candidate)) return candidate;
    }
  }

  return null;
}

async function isUsablePaginationControl(locator: Locator): Promise<boolean> {
  if (!(await locator.isVisible().catch(() => false))) return false;

  return locator.evaluate((element) => {
    let current: Element | null = element;

    while (current && current !== document.body) {
      const htmlElement = current as HTMLElement;
      const className = String(htmlElement.getAttribute("class") ?? "").toLowerCase();
      const isButtonDisabled = "disabled" in htmlElement && Boolean((htmlElement as HTMLButtonElement).disabled);

      if (
        htmlElement.getAttribute("aria-disabled") === "true" ||
        htmlElement.hasAttribute("disabled") ||
        htmlElement.hasAttribute("aria-current") ||
        isButtonDisabled ||
        className.includes("disabled") ||
        className.includes("disable") ||
        className.includes("inactive")
      ) {
        return false;
      }

      current = htmlElement.parentElement;
    }

    return true;
  }).catch(() => false);
}

async function waitForPageSignatureChange(page: Page, previousSignature: string): Promise<void> {
  await page.waitForFunction(buildPageSignatureChangeScript(previousSignature), undefined, { timeout: 5_000 }).catch(
    () => undefined,
  );
}

function buildPageSignatureChangeScript(previousSignature: string): string {
  return `
(() => {
  const currentSignature = location.href + "|" + (document.body?.innerText || "");
  return currentSignature !== ${JSON.stringify(previousSignature)};
})()
`;
}

async function buildPageSignature(page: Page): Promise<string> {
  return `${page.url()}|${await readBodyText(page)}`;
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
    return /(?:^|\\n)\\s*(?:D-\\s*\\d+|채용시까지)\\s*(?=\\n|$)|20\\d{2}[.\\-/년\\s]+\\d{1,2}[.\\-/월\\s]+\\d{1,2}/.test(text);
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
