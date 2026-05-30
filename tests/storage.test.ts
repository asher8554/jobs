// 스냅샷 저장소의 파일 입출력과 정렬 규칙을 검증한다.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSnapshot, preserveFirstSeen, readSnapshot, writeHistory, writeSnapshot } from "../src/storage.js";
import type { JobPosting, Snapshot, SourceStatus } from "../src/model.js";

function job(overrides: Partial<JobPosting>): JobPosting {
  return {
    id: "job-1",
    company: "Kia",
    title: "Platform Engineer",
    careerType: "career",
    startDate: "2026-05-01",
    endDate: "2026-06-06",
    url: "https://example.com/job-1",
    source: "kia",
    firstSeenAt: "2026-05-30T00:00:00.000Z",
    lastSeenAt: "2026-05-30T00:00:00.000Z",
    contentHash: "hash-1",
    ...overrides,
  };
}

const sourceStatus: SourceStatus = {
  source: "kia",
  ok: true,
  checkedAt: "2026-05-30T00:00:00.000Z",
  postingCount: 1,
};

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    checkedAt: "2026-05-30T00:00:00.000Z",
    postings: [job({})],
    sources: [sourceStatus],
    ...overrides,
  };
}

describe("snapshot storage", () => {
  it("returns null when snapshot file is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jobs-storage-"));

    await expect(readSnapshot(join(dir, "missing", "snapshot.json"))).resolves.toBeNull();

    await rm(dir, { recursive: true, force: true });
  });

  it("reads and writes formatted snapshot JSON", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jobs-storage-"));
    const path = join(dir, "nested", "snapshot.json");
    const value = snapshot();

    await writeSnapshot(value, path);

    await expect(readSnapshot(path)).resolves.toEqual(value);
    expect(await readFile(path, "utf8")).toBe(`${JSON.stringify(value, null, 2)}\n`);

    await rm(dir, { recursive: true, force: true });
  });

  it("writes dated history under data history", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jobs-storage-"));
    const originalCwd = process.cwd();
    const value = snapshot();

    try {
      process.chdir(dir);

      await writeHistory(value, "2026-05-30");

      expect(JSON.parse(await readFile(join(dir, "data", "history", "2026-05-30.json"), "utf8"))).toEqual(value);
    } finally {
      process.chdir(originalCwd);
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("preserves firstSeenAt from previous postings with matching ids", () => {
    const previous = [job({ id: "existing", firstSeenAt: "2026-05-01T00:00:00.000Z" })];
    const current = [
      job({ id: "existing", firstSeenAt: "2026-05-30T00:00:00.000Z" }),
      job({ id: "new", firstSeenAt: "2026-05-30T00:00:00.000Z" }),
    ];

    expect(preserveFirstSeen(previous, current)).toEqual([
      job({ id: "existing", firstSeenAt: "2026-05-01T00:00:00.000Z" }),
      job({ id: "new", firstSeenAt: "2026-05-30T00:00:00.000Z" }),
    ]);
  });

  it("builds snapshots sorted by company, end date, and title", () => {
    const postings = [
      job({ id: "c", company: "Kia", endDate: "2026-06-07", title: "C" }),
      job({ id: "a", company: "Hyundai Motor Company", endDate: "2026-06-01", title: "A", source: "hyundai" }),
      job({ id: "b", company: "Kia", endDate: "2026-06-01", title: "B" }),
    ];

    expect(buildSnapshot("2026-05-30T00:00:00.000Z", postings, [sourceStatus])).toEqual({
      checkedAt: "2026-05-30T00:00:00.000Z",
      postings: [
        job({ id: "a", company: "Hyundai Motor Company", endDate: "2026-06-01", title: "A", source: "hyundai" }),
        job({ id: "b", company: "Kia", endDate: "2026-06-01", title: "B" }),
        job({ id: "c", company: "Kia", endDate: "2026-06-07", title: "C" }),
      ],
      sources: [sourceStatus],
    });
  });

  it("does not mutate the original postings order when building snapshots", () => {
    const postings = [
      job({ id: "c", company: "Kia", endDate: "2026-06-07", title: "C" }),
      job({ id: "a", company: "Hyundai Motor Company", endDate: "2026-06-01", title: "A", source: "hyundai" }),
      job({ id: "b", company: "Kia", endDate: "2026-06-01", title: "B" }),
    ];

    buildSnapshot("2026-05-30T00:00:00.000Z", postings, [sourceStatus]);

    expect(postings.map((posting) => posting.id)).toEqual(["c", "a", "b"]);
  });

  it("sorts null end dates before dated end dates within the same company, then by title", () => {
    const postings = [
      job({ id: "dated", company: "Kia", endDate: "2026-06-01", title: "A" }),
      job({ id: "null-b", company: "Kia", endDate: null, title: "B" }),
      job({ id: "null-a", company: "Kia", endDate: null, title: "A" }),
    ];

    const result = buildSnapshot("2026-05-30T00:00:00.000Z", postings, [sourceStatus]);

    expect(result.postings.map((posting) => posting.id)).toEqual(["null-a", "null-b", "dated"]);
  });

  it("throws non-missing read errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jobs-storage-"));
    const path = join(dir, "bad.json");
    await writeFile(path, "{", "utf8");

    await expect(readSnapshot(path)).rejects.toThrow(SyntaxError);

    await rm(dir, { recursive: true, force: true });
  });
});
