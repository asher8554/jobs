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
    const result = diffPostings([], [job({})], "2026-05-30");
    expect(result.newPostings).toHaveLength(1);
  });

  it("detects changed postings", () => {
    const before = job({ contentHash: "old" });
    const after = job({ contentHash: "new", title: "Senior Platform Engineer" });
    const result = diffPostings([before], [after], "2026-05-30");
    expect(result.changedPostings).toEqual([{ before, after }]);
  });

  it("detects closing-soon postings within seven days", () => {
    const result = diffPostings([], [job({ endDate: "2026-06-06" })], "2026-05-30");
    expect(result.closingSoonPostings.map((posting) => posting.id)).toEqual(["job-1"]);
  });

  it("detects removed postings", () => {
    const result = diffPostings([job({})], [], "2026-05-30");
    expect(result.removedPostings).toHaveLength(1);
  });
});
