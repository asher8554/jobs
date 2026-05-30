// 채용 사이트 설정 검증 동작을 확인한다.
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadSiteConfigs, type SiteConfig } from "../src/config.js";

const validSites: SiteConfig[] = [
  {
    source: "samsung",
    url: "https://www.samsungcareers.com/hr/?ty=B",
    defaultCompany: null,
    companies: [
      { name: "Samsung Electronics DX", aliases: ["삼성전자 DX"] },
      { name: "Samsung Electronics DS", aliases: ["삼성전자 DS"] },
    ],
    requiredKeywords: ["경력"],
    excludedKeywords: [],
  },
  {
    source: "lg",
    url: "https://careers.lg.com/apply",
    defaultCompany: null,
    companies: [
      { name: "LG Electronics", aliases: ["LG전자"] },
      { name: "LG Energy Solution", aliases: ["LG에너지솔루션"] },
    ],
    requiredKeywords: ["경력"],
    excludedKeywords: [],
  },
];

async function writeConfig(config: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "jobs-config-"));
  const path = join(dir, "sites.json");
  await writeFile(path, JSON.stringify(config), "utf8");
  return path;
}

describe("site config validation", () => {
  it("loads the repo config with scoped Samsung and LG company rules", async () => {
    const sites = await loadSiteConfigs();
    const samsung = sites.find((site) => site.source === "samsung");
    const lg = sites.find((site) => site.source === "lg");

    expect(samsung?.defaultCompany).toBeNull();
    expect(samsung?.companies.map((company) => company.name).sort()).toEqual([
      "Samsung Electronics DS",
      "Samsung Electronics DX",
    ]);
    expect(lg?.defaultCompany).toBeNull();
    expect(lg?.companies.map((company) => company.name).sort()).toEqual(["LG Electronics", "LG Energy Solution"]);
  });

  it("rejects a non-array top-level config", async () => {
    await expect(loadSiteConfigs(await writeConfig({ sites: validSites }))).rejects.toThrow("must be an array");
  });

  it.each([
    ["source", { ...validSites[0], source: "unknown" }, "source"],
    ["url", { ...validSites[0], url: "ftp://example.com/jobs" }, "url"],
    ["defaultCompany", { ...validSites[0], defaultCompany: "Unknown Company" }, "defaultCompany"],
    ["companies", { ...validSites[0], companies: [{ name: "Unknown Company", aliases: ["미등록 회사"] }] }, "name"],
    ["requiredKeywords", { ...validSites[0], requiredKeywords: ["경력", 123] }, "requiredKeywords"],
    ["excludedKeywords", { ...validSites[0], excludedKeywords: "지원서" }, "excludedKeywords"],
    [
      "aliases",
      { ...validSites[0], companies: [{ name: "Samsung Electronics DX", aliases: ["삼성전자 DX", 123] }] },
      "aliases",
    ],
  ])("rejects invalid %s values", async (_field, site, expectedMessage) => {
    await expect(loadSiteConfigs(await writeConfig([site]))).rejects.toThrow(expectedMessage);
  });

  it.each([
    ["Samsung default company", { ...validSites[0], defaultCompany: "Samsung Electronics DX" }, "defaultCompany"],
    ["Samsung alias rules", { ...validSites[0], companies: [] }, "alias"],
    ["Samsung scoped company", { ...validSites[0], companies: [{ name: "Kia", aliases: ["기아"] }] }, "scoped"],
    ["LG alias rules", { ...validSites[1], companies: [{ name: "LG Electronics", aliases: [] }] }, "alias"],
  ])("rejects invalid %s scoped config", async (_name, site, expectedMessage) => {
    await expect(loadSiteConfigs(await writeConfig([site]))).rejects.toThrow(expectedMessage);
  });
});
