// CLI 진입점이 수집 결과를 파일 출력으로 연결하는지 검증한다.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteConfig } from "../src/config.js";
import { loadSiteConfigs } from "../src/config.js";
import type { JobPosting, Snapshot } from "../src/model.js";
import { scrapeAllSites } from "../src/scrapers/index.js";
import { main } from "../src/index.js";

vi.mock("../src/config.js", () => ({
  loadSiteConfigs: vi.fn(),
}));

vi.mock("../src/scrapers/index.js", () => ({
  scrapeAllSites: vi.fn(),
}));

const checkedAt = "2026-05-30T00:00:00.000Z";

const kiaSite: SiteConfig = {
  source: "kia",
  url: "https://example.com/kia",
  defaultCompany: "Kia",
  companies: [],
  requiredKeywords: ["career"],
  excludedKeywords: [],
};

const hyundaiSite: SiteConfig = {
  source: "hyundai",
  url: "https://example.com/hyundai",
  defaultCompany: "Hyundai Motor Company",
  companies: [],
  requiredKeywords: ["career"],
  excludedKeywords: [],
};

function posting(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: "kia-platform-engineer",
    company: "Kia",
    title: "Platform Engineer",
    careerType: "career",
    startDate: "2026-05-30",
    endDate: "2026-06-06",
    url: "https://example.com/kia/jobs/1",
    source: "kia",
    firstSeenAt: checkedAt,
    lastSeenAt: checkedAt,
    contentHash: "kia-hash",
    ...overrides,
  };
}

describe("CLI entry point", () => {
  let dir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    dir = await mkdtemp(join(tmpdir(), "jobs-index-"));
    process.chdir(dir);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(checkedAt));
    vi.mocked(loadSiteConfigs).mockReset();
    vi.mocked(scrapeAllSites).mockReset();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    vi.useRealTimers();
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("writes public HTML, nojekyll, snapshot, and history after a successful scrape", async () => {
    vi.mocked(loadSiteConfigs).mockResolvedValue([kiaSite]);
    vi.mocked(scrapeAllSites).mockResolvedValue({
      postings: [posting()],
      sources: [{ source: "kia", ok: true, checkedAt, postingCount: 1 }],
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main();

    expect(scrapeAllSites).toHaveBeenCalledWith([kiaSite], checkedAt);
    const html = await readFile(join(dir, "public", "index.html"), "utf8");
    expect(html).toContain("Platform Engineer");
    expect(html).toContain("채용 사이트 바로가기");
    expect(html).toContain(`href="https://example.com/kia"`);
    expect(await readFile(join(dir, "public", ".nojekyll"), "utf8")).toBe("");

    const snapshot = JSON.parse(await readFile(join(dir, "data", "snapshot.json"), "utf8")) as Snapshot;
    expect(snapshot.postings.map((item) => item.id)).toEqual(["kia-platform-engineer"]);
    expect(JSON.parse(await readFile(join(dir, "data", "history", "2026-05-30.json"), "utf8"))).toEqual(snapshot);
    expect(log).toHaveBeenCalledWith("postings=1 sources=1 failed=0");
  });

  it("keeps previous postings and skips snapshot writes when every source fails", async () => {
    const previous: Snapshot = {
      checkedAt: "2026-05-29T00:00:00.000Z",
      postings: [posting({ firstSeenAt: "2026-05-29T00:00:00.000Z" })],
      sources: [{ source: "kia", ok: true, checkedAt: "2026-05-29T00:00:00.000Z", postingCount: 1 }],
    };
    await mkdir(join(dir, "data"), { recursive: true });
    await writeFile(join(dir, "data", "snapshot.json"), `${JSON.stringify(previous, null, 2)}\n`, "utf8");
    vi.mocked(loadSiteConfigs).mockResolvedValue([kiaSite]);
    vi.mocked(scrapeAllSites).mockResolvedValue({
      postings: [],
      sources: [{ source: "kia", ok: false, checkedAt, message: "network failed" }],
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main();

    expect(await readFile(join(dir, "public", "index.html"), "utf8")).toContain("Platform Engineer");
    expect(JSON.parse(await readFile(join(dir, "data", "snapshot.json"), "utf8"))).toEqual(previous);
    await expect(readFile(join(dir, "data", "history", "2026-05-30.json"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("carries forward previous postings for sources that fail during a partial scrape", async () => {
    const previousKiaPosting = posting({
      firstSeenAt: "2026-05-29T00:00:00.000Z",
      lastSeenAt: "2026-05-29T00:00:00.000Z",
    });
    const currentHyundaiPosting = posting({
      id: "hyundai-strategy-manager",
      company: "Hyundai Motor Company",
      title: "Strategy Manager",
      url: "https://example.com/hyundai/jobs/1",
      source: "hyundai",
      contentHash: "hyundai-hash",
    });
    const previous: Snapshot = {
      checkedAt: "2026-05-29T00:00:00.000Z",
      postings: [previousKiaPosting, posting({
        ...currentHyundaiPosting,
        firstSeenAt: "2026-05-29T00:00:00.000Z",
        lastSeenAt: "2026-05-29T00:00:00.000Z",
      })],
      sources: [
        { source: "kia", ok: true, checkedAt: "2026-05-29T00:00:00.000Z", postingCount: 1 },
        { source: "hyundai", ok: true, checkedAt: "2026-05-29T00:00:00.000Z", postingCount: 1 },
      ],
    };
    await mkdir(join(dir, "data"), { recursive: true });
    await writeFile(join(dir, "data", "snapshot.json"), `${JSON.stringify(previous, null, 2)}\n`, "utf8");
    vi.mocked(loadSiteConfigs).mockResolvedValue([kiaSite, hyundaiSite]);
    vi.mocked(scrapeAllSites).mockResolvedValue({
      postings: [currentHyundaiPosting],
      sources: [
        { source: "kia", ok: false, checkedAt, message: "network failed" },
        { source: "hyundai", ok: true, checkedAt, postingCount: 1 },
      ],
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main();

    const snapshot = JSON.parse(await readFile(join(dir, "data", "snapshot.json"), "utf8")) as Snapshot;
    expect(snapshot.postings.map((item) => item.id).sort()).toEqual([
      "hyundai-strategy-manager",
      "kia-platform-engineer",
    ]);
    expect(snapshot.postings.find((item) => item.id === "kia-platform-engineer")).toMatchObject({
      firstSeenAt: "2026-05-29T00:00:00.000Z",
      lastSeenAt: "2026-05-29T00:00:00.000Z",
      source: "kia",
    });
    expect(snapshot.sources).toEqual([
      { source: "kia", ok: false, checkedAt, message: "network failed" },
      { source: "hyundai", ok: true, checkedAt, postingCount: 1 },
    ]);
  });

  it("treats a populated source returning zero postings as a failed scrape", async () => {
    const previousHyundaiPosting = posting({
      id: "hyundai-battery-engineer",
      company: "Hyundai Motor Company",
      title: "Battery Engineer",
      url: "https://example.com/hyundai/jobs/2",
      source: "hyundai",
      firstSeenAt: "2026-05-29T00:00:00.000Z",
      lastSeenAt: "2026-05-29T00:00:00.000Z",
      contentHash: "hyundai-battery-hash",
    });
    const previous: Snapshot = {
      checkedAt: "2026-05-29T00:00:00.000Z",
      postings: [previousHyundaiPosting],
      sources: [{ source: "hyundai", ok: true, checkedAt: "2026-05-29T00:00:00.000Z", postingCount: 1 }],
    };
    await mkdir(join(dir, "data"), { recursive: true });
    await writeFile(join(dir, "data", "snapshot.json"), `${JSON.stringify(previous, null, 2)}\n`, "utf8");
    vi.mocked(loadSiteConfigs).mockResolvedValue([hyundaiSite, kiaSite]);
    vi.mocked(scrapeAllSites).mockResolvedValue({
      postings: [],
      sources: [
        { source: "hyundai", ok: true, checkedAt, postingCount: 0 },
        { source: "kia", ok: true, checkedAt, postingCount: 0 },
      ],
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await main();

    const snapshot = JSON.parse(await readFile(join(dir, "data", "snapshot.json"), "utf8")) as Snapshot;
    expect(snapshot.postings).toEqual([previousHyundaiPosting]);
    expect(snapshot.sources).toEqual([
      {
        source: "hyundai",
        ok: false,
        checkedAt,
        message: "이전 공고 1건이 있었지만 이번 수집이 0건으로 끝나 이전 결과를 유지함",
      },
      { source: "kia", ok: true, checkedAt, postingCount: 0 },
    ]);
    expect(log).toHaveBeenCalledWith("postings=1 sources=2 failed=1");
  });
});
