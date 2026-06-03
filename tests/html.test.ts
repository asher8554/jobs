// 정적 HTML 대시보드가 핵심 섹션을 안전하게 렌더링하는지 검증한다.
import { describe, expect, it } from "vitest";
import { generateHtml } from "../src/generate-html.js";
import type { DiffResult, JobPosting, Snapshot } from "../src/model.js";

const snapshot: Snapshot = {
  checkedAt: "2026-05-30T00:00:00.000Z",
  postings: [],
  sources: [{ source: "kia", ok: true, checkedAt: "2026-05-30T00:00:00.000Z", postingCount: 1 }],
};

const diff: DiffResult = {
  newPostings: [
    posting(),
  ],
  changedPostings: [],
  closingSoonPostings: [],
  removedPostings: [],
};

function posting(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
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
    ...overrides,
  };
}

describe("generateHtml", () => {
  it("renders summary and new postings", () => {
    const html = generateHtml(snapshot, diff);

    expect(html).toContain("채용 변경 모니터");
    expect(html).toContain("신규 공고");
    expect(html).toContain("플랫폼 개발자");
    expect(html).toContain("Source status");
  });

  it("renders a persistent dark mode toggle", () => {
    const html = generateHtml(snapshot, diff);

    expect(html).toContain("data-theme");
    expect(html).toContain("theme-toggle");
    expect(html).toContain("다크 모드");
    expect(html).toContain("localStorage");
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("[data-theme=\"dark\"]");
  });

  it("renders configured source quick links", () => {
    const html = generateHtml(snapshot, diff, [
      {
        source: "hyundai",
        url: "https://talent.hyundai.com/apply/applyList.hc?nfGubnC=abc&tagArray=",
      },
      {
        source: "lg",
        url: "https://careers.lg.com/apply",
      },
    ]);

    expect(html).toContain("채용 사이트 바로가기");
    expect(html).toContain(
      `href="https://talent.hyundai.com/apply/applyList.hc?nfGubnC=abc&amp;tagArray="`,
    );
    expect(html).toContain(">Hyundai</a>");
    expect(html).toContain(`href="https://careers.lg.com/apply"`);
    expect(html).toContain(">LG</a>");
  });

  it("escapes changed before and after posting data", () => {
    const html = generateHtml(snapshot, {
      ...diff,
      newPostings: [],
      changedPostings: [
        {
          before: posting({
            title: `이전 <script>alert("old")</script>`,
            endDate: `2026-06-01" onclick="old()"`,
          }),
          after: posting({
            title: `이후 <img src=x onerror="new()">`,
            endDate: `2026-06-02' onmouseover='new()`,
          }),
        },
      ],
    });

    expect(html).toContain("이후 &lt;img src=x onerror=&quot;new()&quot;&gt;");
    expect(html).toContain("이전 제목: 이전 &lt;script&gt;alert(&quot;old&quot;)&lt;/script&gt;");
    expect(html).toContain("이전 마감: 2026-06-01&quot; onclick=&quot;old()&quot;");
    expect(html).toContain("마감: 2026-06-02&#39; onmouseover=&#39;new()");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("onerror=\"new()\"");
  });

  it("escapes safe URL attributes and rejects unsafe URL schemes", () => {
    const safeUrl = `https://example.com/job?name=<script>&next="quoted"&owner=O'Reilly`;
    const html = generateHtml(snapshot, {
      ...diff,
      newPostings: [
        posting({ id: "safe", title: "Safe job", url: safeUrl }),
        posting({ id: "javascript", title: "JS job", url: `javascript:alert("x")` }),
        posting({ id: "data", title: "Data job", url: "data:text/html,<script>alert(1)</script>" }),
      ],
    });

    expect(html).toContain(
      `href="https://example.com/job?name=&lt;script&gt;&amp;next=&quot;quoted&quot;&amp;owner=O&#39;Reilly"`,
    );
    expect(html).toContain(">JS job</span>");
    expect(html).toContain(">Data job</span>");
    expect(html).not.toContain("href=\"javascript:");
    expect(html).not.toContain("href=\"data:");
  });

  it("escapes closing-soon cards without rendering unsafe links", () => {
    const html = generateHtml(snapshot, {
      ...diff,
      newPostings: [],
      closingSoonPostings: [
        posting({
          title: `마감 <svg onload="alert(1)">`,
          endDate: `2026-06-01<script>`,
          url: "javascript:alert(1)",
        }),
      ],
    });

    expect(html).toContain("마감임박");
    expect(html).toContain("마감 &lt;svg onload=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("마감: 2026-06-01&lt;script&gt;");
    expect(html).not.toContain("href=\"javascript:");
    expect(html).not.toContain("<svg onload");
  });

  it("escapes failed source messages", () => {
    const html = generateHtml(
      {
        ...snapshot,
        sources: [
          {
            source: "kia",
            ok: false,
            checkedAt: "2026-05-30T00:00:00.000Z",
            message: `fetch failed <script>alert("x")</script>`,
          },
        ],
      },
      { ...diff, newPostings: [] },
    );

    expect(html).toContain("실패: fetch failed &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("renders preserved sources without a fail badge", () => {
    const html = generateHtml(
      {
        ...snapshot,
        sources: [
          {
            source: "hyundai",
            ok: true,
            checkedAt: "2026-05-30T00:00:00.000Z",
            postingCount: 30,
            preserved: true,
            message: "이번 수집이 0건으로 끝나 이전 공고 30건을 유지함",
          },
        ],
      },
      { ...diff, newPostings: [] },
    );

    expect(html).toContain("보존 소스");
    expect(html).toContain(`<span class="badge preserved">보존</span>`);
    expect(html).toContain("보존: 이번 수집이 0건으로 끝나 이전 공고 30건을 유지함");
    expect(html).not.toContain(`<span class="badge failed">FAIL</span>`);
  });
});
