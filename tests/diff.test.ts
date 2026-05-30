// 이전 스냅샷과 현재 스냅샷의 채용 공고 차이를 검증한다.
import { describe, expect, it } from "vitest";
import { diffPostings } from "../src/diff.js";
import type { JobPosting } from "../src/model.js";

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

describe("diffPostings", () => {
  it("detects new postings", () => {
    const result = diffPostings([], [job({ endDate: "2026-06-07" })], "2026-05-30");
    expect(result.newPostings).toHaveLength(1);
    expect(result.changedPostings).toEqual([]);
    expect(result.closingSoonPostings).toEqual([]);
    expect(result.removedPostings).toEqual([]);
  });

  it("detects changed postings", () => {
    const before = job({ contentHash: "old", endDate: "2026-06-07" });
    const after = job({
      contentHash: "new",
      endDate: "2026-06-07",
      title: "Senior Platform Engineer",
    });
    const result = diffPostings([before], [after], "2026-05-30");
    expect(result.changedPostings).toEqual([{ before, after }]);
    expect(result.newPostings).toEqual([]);
    expect(result.closingSoonPostings).toEqual([]);
    expect(result.removedPostings).toEqual([]);
  });

  it("matches unique postings when generated ids change", () => {
    const before = job({ id: "legacy-id", contentHash: "legacy-hash", title: "Same Posting" });
    const after = job({ id: "stable-id", contentHash: "stable-hash", title: "Same Posting" });

    const result = diffPostings([before], [after], "2026-05-30");

    expect(result.newPostings).toEqual([]);
    expect(result.changedPostings).toEqual([]);
    expect(result.removedPostings).toEqual([]);
  });

  it("detects date changes when generated ids change", () => {
    const before = job({ id: "legacy-id", contentHash: "legacy-hash", title: "Same Posting" });
    const after = job({
      id: "stable-id",
      contentHash: "stable-hash",
      title: "Same Posting",
      endDate: "2026-06-07",
    });

    const result = diffPostings([before], [after], "2026-05-30");

    expect(result.newPostings).toEqual([]);
    expect(result.changedPostings).toEqual([{ before, after }]);
    expect(result.removedPostings).toEqual([]);
  });

  it("detects closing-soon postings within seven days", () => {
    const posting = job({ endDate: "2026-06-06" });
    const result = diffPostings([posting], [posting], "2026-05-30");
    expect(result.closingSoonPostings.map((posting) => posting.id)).toEqual(["job-1"]);
  });

  it("handles closing-soon boundaries", () => {
    const dueToday = job({
      id: "due-today",
      contentHash: "hash-due-today",
      endDate: "2026-05-30",
      url: "https://example.com/due-today",
    });
    const dayEight = job({
      id: "day-eight",
      contentHash: "hash-day-eight",
      endDate: "2026-06-07",
      url: "https://example.com/day-eight",
    });
    const expired = job({
      id: "expired",
      contentHash: "hash-expired",
      endDate: "2026-05-29",
      url: "https://example.com/expired",
    });
    const openEnded = job({
      id: "open-ended",
      contentHash: "hash-open-ended",
      endDate: null,
      url: "https://example.com/open-ended",
    });
    const postings = [dueToday, dayEight, expired, openEnded];

    const result = diffPostings(postings, postings, "2026-05-30");

    expect(result.closingSoonPostings.map((posting) => posting.id)).toEqual(["due-today"]);
    expect(result.newPostings).toEqual([]);
    expect(result.changedPostings).toEqual([]);
    expect(result.removedPostings).toEqual([]);
  });

  it("detects removed postings", () => {
    const result = diffPostings([job({})], [], "2026-05-30");
    expect(result.removedPostings).toHaveLength(1);
    expect(result.newPostings).toEqual([]);
    expect(result.changedPostings).toEqual([]);
    expect(result.closingSoonPostings).toEqual([]);
  });

  it("rejects duplicate ids in previous postings", () => {
    expect(() =>
      diffPostings(
        [
          job({ id: "duplicate-id", contentHash: "hash-1" }),
          job({ id: "duplicate-id", contentHash: "hash-2" }),
        ],
        [],
        "2026-05-30",
      ),
    ).toThrow(/Duplicate job id.*duplicate-id/);
  });

  it("rejects duplicate ids in current postings", () => {
    expect(() =>
      diffPostings(
        [],
        [
          job({ id: "duplicate-id", contentHash: "hash-1" }),
          job({ id: "duplicate-id", contentHash: "hash-2" }),
        ],
        "2026-05-30",
      ),
    ).toThrow(/Duplicate job id.*duplicate-id/);
  });
});
