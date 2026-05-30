// 채용 사이트별 수집 조건을 설정 파일에서 읽는다.
import { readFile } from "node:fs/promises";
import type { CompanyName, JobSource } from "./model.js";

export type CompanyRule = {
  name: CompanyName;
  aliases: string[];
};

export type SiteConfig = {
  source: JobSource;
  url: string;
  defaultCompany: CompanyName | null;
  companies: CompanyRule[];
  requiredKeywords: string[];
  excludedKeywords: string[];
};

export async function loadSiteConfigs(path = "config/sites.json"): Promise<SiteConfig[]> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as SiteConfig[];
}
