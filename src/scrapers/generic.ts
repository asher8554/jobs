// 채용 사이트 화면에서 공고 후보를 추출하고 공통 공고 모델로 정규화한다.
import type { Browser, Page } from "playwright";
import type { SiteConfig } from "../config.js";
import { extractDateRange } from "../date.js";
import { buildContentHash, buildPostingId } from "../hash.js";
import type { CompanyName, JobPosting, SourceStatus } from "../model.js";

export type CandidateBlock = {
  text: string;
  url: string;
};

export type ScrapeOutput = {
  postings: JobPosting[];
  status: SourceStatus;
};

const DATE_TOKEN_PATTERN_SOURCE = String.raw`20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}(?:일)?`;
const DATE_LINE_PATTERN = new RegExp(DATE_TOKEN_PATTERN_SOURCE);
const DATE_RANGE_PATTERN = new RegExp(`${DATE_TOKEN_PATTERN_SOURCE}\\s*[-~〜–—]\\s*${DATE_TOKEN_PATTERN_SOURCE}`, "g");
const LOAD_MORE_TEXT_PATTERN = /더보기|더 보기|More|MORE|Load more|전체보기|결과 더 보기/i;
const CAREER_LABEL_PATTERN = /^\s*(?:[\[【(]\s*)?경력(?:직)?(?:\s*[\]】)])?(?=$|[\s:：\-|])/;

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

    const blocks = await collectCandidateBlocks(page);
    if (blocks.length === 0) {
      return {
        postings: [],
        status: {
          source: site.source,
          ok: false,
          checkedAt,
          message: "No candidate posting blocks found.",
        },
      };
    }

    const postings = parseCandidateBlocks(site, blocks, checkedAt);
    if (postings.length === 0) {
      return {
        postings: [],
        status: {
          source: site.source,
          ok: false,
          checkedAt,
          message: `No postings parsed from ${blocks.length} candidate blocks.`,
        },
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

function hasRequiredKeywords(text: string, requiredKeywords: string[]): boolean {
  return requiredKeywords.every((keyword) => keyword === "" || text.includes(keyword));
}

function hasExcludedKeyword(text: string, excludedKeywords: string[]): boolean {
  return excludedKeywords.some((keyword) => keyword !== "" && text.includes(keyword));
}

function normalizeBlock(site: SiteConfig, block: CandidateBlock, checkedAt: string): JobPosting | null {
  const url = normalizeHttpUrl(block.url);
  if (!url) return null;

  const companies = detectCompanies(site, block.text);
  if (companies.length !== 1) return null;

  const company = companies[0];
  const titleCandidates = extractTitleCandidates(site, block.text, company);
  if (isAmbiguousDefaultCompanyBlock(site, block.text, titleCandidates)) return null;

  const title = selectTitleCandidate(titleCandidates);
  if (!title) return null;

  const { startDate, endDate } = extractDateRange(block.text);
  const posting: JobPosting = {
    id: buildPostingId(site.source, company, title, url),
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
    contentHash: buildContentHash(posting),
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

function stripCareerLabel(line: string): string {
  return line.replace(CAREER_LABEL_PATTERN, "").replace(/^[\s:：\-|]+/, "").trim();
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

async function clickLoadMore(page: Page): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    const loadMore = page.getByText(LOAD_MORE_TEXT_PATTERN).first();
    if (!(await loadMore.isVisible().catch(() => false))) return;

    await loadMore.click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
  }
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

async function collectCandidateBlocks(page: Page): Promise<CandidateBlock[]> {
  return page.evaluate(() => {
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
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selectors));
    const seen = new Set<string>();
    const blocks: CandidateBlock[] = [];

    function normalizeText(element: HTMLElement): string {
      return (element.innerText ?? "")
        .trim()
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
    }

    function resolveHttpUrl(value: string, base: string): string | null {
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

    function validAnchorUrlsIn(element: HTMLElement): string[] {
      const anchors = element.matches("a[href]")
        ? [element as HTMLAnchorElement]
        : Array.from(element.querySelectorAll<HTMLAnchorElement>("a[href]"));
      return anchors
        .map((anchor) => resolveHttpUrl(anchor.getAttribute("href") ?? "", location.href))
        .filter((url): url is string => url !== null);
    }

    function hasAnchorHrefIn(element: HTMLElement): boolean {
      return element.matches("a[href]") || element.querySelector("a[href]") !== null;
    }

    function hasMultiplePostingChildren(element: HTMLElement): boolean {
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
      const children = Array.from(element.querySelectorAll<HTMLElement>(containerSelectors)).filter((child) => {
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
      const url = anchorUrls[0] ?? (hasAnchorHrefIn(element) ? null : resolveHttpUrl(location.href, location.href));
      if (!url) continue;

      const key = `${text}|${url}`;
      if (seen.has(key)) continue;

      seen.add(key);
      blocks.push({ text, url });
    }

    return blocks;
  });
}
