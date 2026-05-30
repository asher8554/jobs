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

const allowedSources: readonly JobSource[] = ["samsung", "hyundai", "kia", "mobis", "lg"];

const allowedCompanies: readonly CompanyName[] = [
  "Samsung Electronics DX",
  "Samsung Electronics DS",
  "Hyundai Motor Company",
  "Kia",
  "Hyundai Mobis",
  "LG Electronics",
  "LG Energy Solution",
];

const scopedCompanies: Partial<Record<JobSource, readonly CompanyName[]>> = {
  samsung: ["Samsung Electronics DX", "Samsung Electronics DS"],
  lg: ["LG Electronics", "LG Energy Solution"],
};

export async function loadSiteConfigs(path = "config/sites.json"): Promise<SiteConfig[]> {
  const raw = await readFile(path, "utf8");
  return validateSiteConfigs(JSON.parse(raw));
}

function validateSiteConfigs(value: unknown): SiteConfig[] {
  if (!Array.isArray(value)) {
    throw new Error("Site config must be an array.");
  }

  return value.map((site, index) => validateSiteConfig(site, `site config ${index}`));
}

function validateSiteConfig(value: unknown, label: string): SiteConfig {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const source = validateSource(value.source, `${label}.source`);
  const url = validateHttpUrl(value.url, `${label}.url`);
  const defaultCompany = validateDefaultCompany(value.defaultCompany, `${label}.defaultCompany`);
  const companies = validateCompanies(value.companies, `${label}.companies`);
  const requiredKeywords = validateStringArray(value.requiredKeywords, `${label}.requiredKeywords`);
  const excludedKeywords = validateStringArray(value.excludedKeywords, `${label}.excludedKeywords`);

  validateScopedCompanyRules(source, defaultCompany, companies, label);

  return {
    source,
    url,
    defaultCompany,
    companies,
    requiredKeywords,
    excludedKeywords,
  };
}

function validateSource(value: unknown, label: string): JobSource {
  if (typeof value !== "string" || !allowedSources.includes(value as JobSource)) {
    throw new Error(`${label} must be one of: ${allowedSources.join(", ")}.`);
  }

  return value as JobSource;
}

function validateDefaultCompany(value: unknown, label: string): CompanyName | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || !allowedCompanies.includes(value as CompanyName)) {
    throw new Error(`${label} must be null or one of: ${allowedCompanies.join(", ")}.`);
  }

  return value as CompanyName;
}

function validateCompanies(value: unknown, label: string): CompanyRule[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((company, index) => validateCompanyRule(company, `${label}[${index}]`));
}

function validateCompanyRule(value: unknown, label: string): CompanyRule {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }

  if (typeof value.name !== "string" || !allowedCompanies.includes(value.name as CompanyName)) {
    throw new Error(`${label}.name must be one of: ${allowedCompanies.join(", ")}.`);
  }

  return {
    name: value.name as CompanyName,
    aliases: validateStringArray(value.aliases, `${label}.aliases`),
  };
}

function validateHttpUrl(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be an http or https URL string.`);
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Invalid protocol.");
    }
  } catch {
    throw new Error(`${label} must be an http or https URL string.`);
  }

  return value;
}

function validateStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }

  return value;
}

function validateScopedCompanyRules(
  source: JobSource,
  defaultCompany: CompanyName | null,
  companies: CompanyRule[],
  label: string,
): void {
  const allowedScopedCompanies = scopedCompanies[source];

  if (!allowedScopedCompanies) {
    return;
  }

  if (defaultCompany !== null) {
    throw new Error(`${label}.defaultCompany must be null for ${source}.`);
  }

  if (companies.length === 0 || companies.some((company) => company.aliases.length === 0)) {
    throw new Error(`${label}.companies must include nonempty alias rules for ${source}.`);
  }

  for (const company of companies) {
    if (!allowedScopedCompanies.includes(company.name)) {
      throw new Error(`${label}.companies must only include ${source} scoped companies.`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
