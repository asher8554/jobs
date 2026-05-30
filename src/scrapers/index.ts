// 사이트별 수집기를 실행하고 실패를 사이트 단위로 격리한다.
import { chromium } from "playwright";
import type { SiteConfig } from "../config.js";
import type { JobPosting, SourceStatus } from "../model.js";
import { scrapeSamsung } from "./samsung.js";
import { scrapeHyundai } from "./hyundai.js";
import { scrapeKia } from "./kia.js";
import { scrapeMobis } from "./mobis.js";
import { scrapeLg } from "./lg.js";

export type ScrapeRunResult = {
  postings: JobPosting[];
  sources: SourceStatus[];
};

export async function scrapeAllSites(sites: SiteConfig[], checkedAt: string): Promise<ScrapeRunResult> {
  const browser = await chromium.launch({ headless: true });
  const postings: JobPosting[] = [];
  const sources: SourceStatus[] = [];

  try {
    for (const site of sites) {
      try {
        const result = await scrapeOneSite(browser, site, checkedAt);
        postings.push(...result.postings);
        sources.push(result.status);
      } catch (error) {
        sources.push({
          source: site.source,
          ok: false,
          checkedAt,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    await browser.close();
  }

  return { postings, sources };
}

async function scrapeOneSite(browser: Awaited<ReturnType<typeof chromium.launch>>, site: SiteConfig, checkedAt: string) {
  switch (site.source) {
    case "samsung":
      return scrapeSamsung(browser, site, checkedAt);
    case "hyundai":
      return scrapeHyundai(browser, site, checkedAt);
    case "kia":
      return scrapeKia(browser, site, checkedAt);
    case "mobis":
      return scrapeMobis(browser, site, checkedAt);
    case "lg":
      return scrapeLg(browser, site, checkedAt);
  }
}
