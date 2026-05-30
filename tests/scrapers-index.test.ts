// 스크레이퍼 오케스트레이터가 사이트별 실패를 격리하는지 검증한다.
import type { Browser } from "playwright";
import { chromium } from "playwright";
import { describe, expect, it, vi } from "vitest";
import type { SiteConfig } from "../src/config.js";
import type { JobPosting } from "../src/model.js";
import { scrapeAllSites } from "../src/scrapers/index.js";
import { scrapeHyundai } from "../src/scrapers/hyundai.js";
import { scrapeSamsung } from "../src/scrapers/samsung.js";

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

vi.mock("../src/scrapers/samsung.js", () => ({
  scrapeSamsung: vi.fn(),
}));

vi.mock("../src/scrapers/hyundai.js", () => ({
  scrapeHyundai: vi.fn(),
}));

const checkedAt = "2026-05-30T00:00:00.000Z";

const samsungSite: SiteConfig = {
  source: "samsung",
  url: "https://example.com/samsung",
  defaultCompany: null,
  companies: [
    { name: "Samsung Electronics DX", aliases: ["DX"] },
    { name: "Samsung Electronics DS", aliases: ["DS"] },
  ],
  requiredKeywords: ["경력"],
  excludedKeywords: [],
};

const hyundaiSite: SiteConfig = {
  source: "hyundai",
  url: "https://example.com/hyundai",
  defaultCompany: "Hyundai Motor Company",
  companies: [],
  requiredKeywords: ["경력"],
  excludedKeywords: [],
};

const hyundaiPosting: JobPosting = {
  id: "hyundai-platform-engineer",
  company: "Hyundai Motor Company",
  title: "Platform Engineer",
  careerType: "career",
  startDate: "2026-05-30",
  endDate: "2026-06-06",
  url: "https://example.com/hyundai/jobs/1",
  source: "hyundai",
  firstSeenAt: checkedAt,
  lastSeenAt: checkedAt,
  contentHash: "hyundai-hash",
};

describe("scrapeAllSites", () => {
  it("records a thrown source as failed and still collects later successes", async () => {
    const browser = {
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Browser;

    vi.mocked(chromium.launch).mockResolvedValue(browser);
    vi.mocked(scrapeSamsung).mockRejectedValue(new Error("wrapper exploded"));
    vi.mocked(scrapeHyundai).mockResolvedValue({
      postings: [hyundaiPosting],
      status: {
        source: "hyundai",
        ok: true,
        checkedAt,
        postingCount: 1,
      },
    });

    const result = await scrapeAllSites([samsungSite, hyundaiSite], checkedAt);

    expect(result.postings).toEqual([hyundaiPosting]);
    expect(result.sources).toEqual([
      {
        source: "samsung",
        ok: false,
        checkedAt,
        message: "wrapper exploded",
      },
      {
        source: "hyundai",
        ok: true,
        checkedAt,
        postingCount: 1,
      },
    ]);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });
});
