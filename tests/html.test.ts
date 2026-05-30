// 정적 HTML 대시보드가 핵심 섹션을 렌더링하는지 검증한다.
import { describe, expect, it } from "vitest";
import { generateHtml } from "../src/generate-html.js";
import type { DiffResult, Snapshot } from "../src/model.js";

const snapshot: Snapshot = {
  checkedAt: "2026-05-30T00:00:00.000Z",
  postings: [],
  sources: [{ source: "kia", ok: true, checkedAt: "2026-05-30T00:00:00.000Z", postingCount: 1 }],
};

const diff: DiffResult = {
  newPostings: [
    {
      id: "kia-1",
      company: "Kia",
      title: "플랫폼 개발자",
      careerType: "career",
      startDate: "2026-05-30",
      endDate: "2026-06-06",
      url: "https://example.com/job",
      source: "kia",
      firstSeenAt: "2026-05-30T00:00:00.000Z",
      lastSeenAt: "2026-05-30T00:00:00.000Z",
      contentHash: "hash",
    },
  ],
  changedPostings: [],
  closingSoonPostings: [],
  removedPostings: [],
};

describe("generateHtml", () => {
  it("renders summary and new postings", () => {
    const html = generateHtml(snapshot, diff);

    expect(html).toContain("채용 변경 모니터");
    expect(html).toContain("신규 공고");
    expect(html).toContain("플랫폼 개발자");
    expect(html).toContain("Source status");
  });
});
