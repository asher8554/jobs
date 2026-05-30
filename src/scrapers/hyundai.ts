// 현대자동차 채용 사이트의 경력 공고를 수집한다.
import type { Browser } from "playwright";
import type { SiteConfig } from "../config.js";
import { scrapeGenericCareerPage } from "./generic.js";

export async function scrapeHyundai(browser: Browser, site: SiteConfig, checkedAt: string) {
  return scrapeGenericCareerPage(browser, site, checkedAt);
}
