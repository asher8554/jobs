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

const DATE_LINE_PATTERN = /20\d{2}[.\-/\s]+\d{1,2}[.\-/\s]+\d{1,2}/;
const LOAD_MORE_TEXT_PATTERN = /더보기|더 보기|More|MORE|Load more|전체보기|결과 더 보기/i;

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
    await page.goto(site.url, { waitUntil: "networkidle", timeout: 60_000 });
    await clickLoadMore(page);

    const blocks = await collectCandidateBlocks(page);
    const postings = parseCandidateBlocks(site, blocks, checkedAt);

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
  const company = detectCompany(site, block.text);
  if (!company) return null;

  const title = extractTitle(site, block.text, company);
  if (!title) return null;

  const { startDate, endDate } = extractDateRange(block.text);
  const url = block.url || site.url;
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

function detectCompany(site: SiteConfig, text: string): CompanyName | null {
  if (site.defaultCompany) return site.defaultCompany;

  for (const company of site.companies) {
    const names = [company.name, ...company.aliases];
    if (names.some((name) => name !== "" && text.includes(name))) {
      return company.name;
    }
  }

  return null;
}

function extractTitle(site: SiteConfig, text: string, company: CompanyName): string | null {
  const companyMarkers = buildCompanyMarkers(site, company);
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .filter((line) => !site.requiredKeywords.some((keyword) => keyword !== "" && line.includes(keyword)))
    .filter((line) => !DATE_LINE_PATTERN.test(line))
    .filter((line) => !companyMarkers.some((marker) => line.includes(marker)))
    .filter((line) => line.length >= 4 && line.length <= 120);

  return lines.sort((a, b) => b.length - a.length)[0] ?? null;
}

function buildCompanyMarkers(site: SiteConfig, company: CompanyName): string[] {
  const matchingRule = site.companies.find((rule) => rule.name === company);
  const companyTokens = company.split(/\s+/).filter((token) => token.length > 2);
  return [company, ...(matchingRule?.aliases ?? []), ...companyTokens].filter((marker) => marker !== "");
}

async function clickLoadMore(page: Page): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    const loadMore = page.getByText(LOAD_MORE_TEXT_PATTERN).first();
    if (!(await loadMore.isVisible().catch(() => false))) return;

    await loadMore.click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
  }
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
      "[class*='list']",
    ].join(",");
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selectors));
    const seen = new Set<string>();
    const blocks: CandidateBlock[] = [];

    for (const element of elements) {
      const text = (element.innerText ?? "")
        .trim()
        .replace(/\r\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n");
      if (text.length < 12 || text.length > 1200) continue;

      const anchor = element.matches("a[href]")
        ? (element as HTMLAnchorElement)
        : element.querySelector<HTMLAnchorElement>("a[href]");
      const href = anchor?.getAttribute("href") ?? location.href;
      const url = new URL(href, location.href).toString();
      const key = `${text}|${url}`;
      if (seen.has(key)) continue;

      seen.add(key);
      blocks.push({ text, url });
    }

    return blocks;
  });
}
