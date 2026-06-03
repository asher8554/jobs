// 채용 사이트에서 추출한 텍스트 블록을 공통 공고 모델로 바꾸는 규칙을 검증한다.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { chromium } from "playwright";
import { parseCandidateBlocks, scrapeGenericCareerPage } from "../src/scrapers/generic.js";
import type { SiteConfig } from "../src/config.js";

const kiaConfig: SiteConfig = {
  source: "kia",
  url: "https://career.kia.com/apply/applyList.kc",
  defaultCompany: "Kia",
  companies: [],
  requiredKeywords: ["경력"],
  excludedKeywords: ["지원서"],
};

const hyundaiConfig: SiteConfig = {
  source: "hyundai",
  url: "https://talent.hyundai.com",
  defaultCompany: "Hyundai Motor Company",
  companies: [],
  requiredKeywords: ["경력"],
  excludedKeywords: [],
};

const mobisConfig: SiteConfig = {
  source: "mobis",
  url: "https://careers.mobis.com",
  defaultCompany: "Hyundai Mobis",
  companies: [],
  requiredKeywords: ["경력"],
  excludedKeywords: [],
};

const lgConfig: SiteConfig = {
  source: "lg",
  url: "https://careers.lg.com/apply",
  defaultCompany: null,
  companies: [
    { name: "LG Electronics", aliases: ["LG전자"] },
    { name: "LG Energy Solution", aliases: ["LG에너지솔루션"] },
  ],
  requiredKeywords: ["경력"],
  excludedKeywords: ["로그인"],
};

describe("scrapeGenericCareerPage", () => {
  it("scrapes a data URL posting without transformed evaluate helper failures", async () => {
    const browser = await chromium.launch();
    const postingUrl = "https://career.kia.com/job/tsx-regression";
    const html = `
      <!doctype html>
      <html>
        <body>
          <main>
            <ul>
              <li>
                <a href="${postingUrl}">Career<br>Backend Engineer<br>2026.05.30 ~ 2026.06.06</a>
              </li>
            </ul>
          </main>
        </body>
      </html>
    `;

    try {
      const result = await scrapeGenericCareerPage(
        browser,
        {
          ...kiaConfig,
          url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
          requiredKeywords: ["Career"],
          excludedKeywords: [],
        },
        "2026-05-30T00:00:00.000Z",
      );

      expect(result.status).toMatchObject({
        source: "kia",
        ok: true,
        postingCount: 1,
      });
      expect(result.postings).toHaveLength(1);
      expect(result.postings[0]).toMatchObject({
        company: "Kia",
        title: "Backend Engineer",
        url: postingUrl,
      });
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("returns zero postings successfully when the page states no active postings", async () => {
    const browser = await chromium.launch();
    const html = `
      <!doctype html>
      <html>
        <body>
          <main>0 개의 채용 공고가 현재 진행중입니다.</main>
        </body>
      </html>
    `;

    try {
      const result = await scrapeGenericCareerPage(
        browser,
        {
          ...mobisConfig,
          url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
        },
        "2026-05-30T00:00:00.000Z",
      );

      expect(result.status).toMatchObject({
        source: "mobis",
        ok: true,
        postingCount: 0,
      });
      expect(result.postings).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("returns zero postings successfully when target-company filters find no rows", async () => {
    const browser = await chromium.launch();
    const html = `
      <!doctype html>
      <html>
        <body>
          <main>
            <ul>
              <li>
                <a href="https://careers.lg.com/job/non-target">
                  LG화학<br>
                  경력<br>
                  소재 연구원<br>
                  2026.05.30 ~ 2026.06.06
                </a>
              </li>
            </ul>
          </main>
        </body>
      </html>
    `;

    try {
      const result = await scrapeGenericCareerPage(
        browser,
        {
          ...lgConfig,
          url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
        },
        "2026-05-30T00:00:00.000Z",
      );

      expect(result.status).toMatchObject({
        source: "lg",
        ok: true,
        postingCount: 0,
      });
      expect(result.postings).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("scrapes LG-style text-only cards from line-based page content", async () => {
    const browser = await chromium.launch();
    const html = `
      <!doctype html>
      <html>
        <body>
          <main>
            <div>
              <div>LG에너지솔루션</div>
              <div>[ESS전지] ESS 시스템 개발 경력 모집</div>
              <div>D-17</div>
              <div>2026.06.16 23:00</div>
              <div>경력</div>
              <div>LG에너지솔루션</div>
              <div>연구/개발</div>
            </div>
          </main>
        </body>
      </html>
    `;

    try {
      await withHtmlServer(html, async (url) => {
        const result = await scrapeGenericCareerPage(
          browser,
          {
            ...lgConfig,
            companies: [
              { name: "LG Electronics", aliases: ["LG전자"] },
              { name: "LG Energy Solution", aliases: ["LG에너지솔루션"] },
            ],
            requiredKeywords: ["경력"],
            excludedKeywords: [],
            url,
          },
          "2026-05-30T00:00:00.000Z",
        );

        expect(result.status).toMatchObject({
          source: "lg",
          ok: true,
          postingCount: 1,
        });
        expect(result.postings[0]).toMatchObject({
          company: "LG Energy Solution",
          title: "[ESS전지] ESS 시스템 개발 경력 모집",
          endDate: "2026-06-16",
          url,
        });
      });
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("does not attach a following non-target career card to a repeated target-company metadata line", async () => {
    const browser = await chromium.launch();
    const html = `
      <!doctype html>
      <html>
        <body>
          <main>
            <div>LG전자</div>
            <div>2026년 LG전자 채용계약학과 모집</div>
            <div>D-15</div>
            <div>2026.06.14 23:00</div>
            <div>산학장학생</div>
            <div>LG전자</div>
            <div>연구/개발</div>
            <div>하이엠솔루텍</div>
            <div>[정규직] HVAC 설비공사 PM 담당자 모집(김해)</div>
            <div>D-1</div>
            <div>2026.05.31 23:00</div>
            <div>경력</div>
            <div>하이엠솔루텍</div>
            <div>고객서비스</div>
            <div>LG에너지솔루션</div>
            <div>[ESS전지] ESS 시스템 개발 경력 모집</div>
            <div>D-17</div>
            <div>2026.06.16 23:00</div>
            <div>경력</div>
            <div>LG에너지솔루션</div>
            <div>연구/개발</div>
          </main>
        </body>
      </html>
    `;

    try {
      await withHtmlServer(html, async (url) => {
        const result = await scrapeGenericCareerPage(
          browser,
          {
            ...lgConfig,
            companies: [
              { name: "LG Electronics", aliases: ["LG전자"] },
              { name: "LG Energy Solution", aliases: ["LG에너지솔루션"] },
            ],
            requiredKeywords: ["경력"],
            excludedKeywords: [],
            url,
          },
          "2026-05-30T00:00:00.000Z",
        );

        expect(result.status).toMatchObject({
          source: "lg",
          ok: true,
          postingCount: 1,
        });
        expect(result.postings.map((posting) => posting.title)).toEqual(["[ESS전지] ESS 시스템 개발 경력 모집"]);
      });
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("marks required-keyword rows that cannot be parsed as a scrape failure", async () => {
    const browser = await chromium.launch();
    const html = `
      <!doctype html>
      <html>
        <body>
          <main>
            <ul>
              <li>
                <a href="https://career.kia.com/job/broken">
                  Career<br>
                  2026.05.30 ~ 2026.06.06
                </a>
              </li>
            </ul>
          </main>
        </body>
      </html>
    `;

    try {
      const result = await scrapeGenericCareerPage(
        browser,
        {
          ...kiaConfig,
          url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
          requiredKeywords: ["Career"],
          excludedKeywords: [],
        },
        "2026-05-30T00:00:00.000Z",
      );

      expect(result.status).toMatchObject({
        source: "kia",
        ok: false,
      });
      expect(result.postings).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("waits for delayed posting rows after early navigation selectors exist", async () => {
    const browser = await chromium.launch();
    const postingUrl = "https://career.kia.com/job/delayed";
    const html = `
      <!doctype html>
      <html>
        <body>
          <nav><ul><li>Navigation</li></ul></nav>
          <main><ul id="jobs"></ul></main>
          <script>
            setTimeout(() => {
              document.querySelector("#jobs").innerHTML =
                '<li><a href="${postingUrl}">경력<br>Delayed Engineer<br>2026.05.30 ~ 2026.06.06</a></li>';
            }, 1000);
          </script>
        </body>
      </html>
    `;

    try {
      const result = await scrapeGenericCareerPage(
        browser,
        {
          ...kiaConfig,
          url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
        },
        "2026-05-30T00:00:00.000Z",
      );

      expect(result.status).toMatchObject({
        source: "kia",
        ok: true,
        postingCount: 1,
      });
      expect(result.postings[0]).toMatchObject({
        company: "Kia",
        title: "Delayed Engineer",
        endDate: "2026-06-06",
      });
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("scrapes postings from every numbered pagination page", async () => {
    const browser = await chromium.launch();
    const firstPostingUrl = "https://career.kia.com/job/page-1";
    const secondPostingUrl = "https://career.kia.com/job/page-2";

    try {
      await withPagedHtmlServer({
        "/apply?page=1": `
          <!doctype html>
          <html>
            <body>
              <main>
                <ul>
                  <li>
                    <a href="${firstPostingUrl}">경력<br>First Page Engineer<br>2026.05.30 ~ 2026.06.06</a>
                  </li>
                </ul>
                <nav aria-label="pagination">
                  <a href="/apply?page=2" aria-label="다음 페이지">다음</a>
                </nav>
              </main>
            </body>
          </html>
        `,
        "/apply?page=2": `
          <!doctype html>
          <html>
            <body>
              <main>
                <ul>
                  <li>
                    <a href="${secondPostingUrl}">경력<br>Second Page Engineer<br>2026.05.31 ~ 2026.06.07</a>
                  </li>
                </ul>
                <nav aria-label="pagination">
                  <span aria-current="page">2</span>
                </nav>
              </main>
            </body>
          </html>
        `,
      }, async (url) => {
        const result = await scrapeGenericCareerPage(
          browser,
          {
            ...kiaConfig,
            url,
          },
          "2026-05-30T00:00:00.000Z",
        );

        expect(result.status).toMatchObject({
          source: "kia",
          ok: true,
          postingCount: 2,
        });
        expect(result.postings.map((posting) => posting.title)).toEqual([
          "First Page Engineer",
          "Second Page Engineer",
        ]);
        expect(result.postings.map((posting) => posting.url)).toEqual([
          firstPostingUrl,
          secondPostingUrl,
        ]);
      });
    } finally {
      await browser.close();
    }
  }, 30_000);

  it("scrapes Hyundai-style javascript-only posting anchors with the page URL fallback", async () => {
    const browser = await chromium.launch();
    const html = `
      <!doctype html>
      <html>
        <body>
          <main>
            <ul class="apply__list">
              <li>
                <span>5월 경력채용</span>
                <button>공유</button>
                <a href="javascript:void(0)">
                  <div class="top"><strong>제조경쟁력 강화 전략 수립</strong></div>
                  <div>D-1</div>
                  <span>#사업/기획</span>
                  <span>#경영전략</span>
                  <span>#양재본사</span>
                  <span>#경력</span>
                  <span>#5월 경력 채용</span>
                </a>
              </li>
            </ul>
          </main>
        </body>
      </html>
    `;

    try {
      await withHtmlServer(html, async (url) => {
        const result = await scrapeGenericCareerPage(
          browser,
          {
            ...hyundaiConfig,
            url,
          },
          "2026-05-30T00:00:00.000Z",
        );

        expect(result.status).toMatchObject({
          source: "hyundai",
          ok: true,
          postingCount: 1,
        });
        expect(result.postings).toHaveLength(1);
        expect(result.postings[0]).toMatchObject({
          company: "Hyundai Motor Company",
          title: "제조경쟁력 강화 전략 수립",
          endDate: "2026-05-31",
          url,
        });
      });
    } finally {
      await browser.close();
    }
  }, 30_000);
});

describe("parseCandidateBlocks", () => {
  it("parses Hyundai live-style career cards with D-day deadlines", () => {
    const result = parseCandidateBlocks(hyundaiConfig, [{
      text: [
        "5월 경력채용",
        "",
        "  공유",
        "제조경쟁력 강화 전략 수립",
        "D-1",
        "#사업/기획",
        "#경영전략",
        "#양재본사",
        "#경력",
        "#5월 경력 채용",
      ].join("\n"),
      url: "https://talent.hyundai.com/job/1",
    }], "2026-05-30T00:00:00.000Z");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      company: "Hyundai Motor Company",
      title: "제조경쟁력 강화 전략 수립",
      endDate: "2026-05-31",
      source: "hyundai",
    });
  });

  it("uses the checkedAt KST date for D-0 deadlines", () => {
    const result = parseCandidateBlocks(hyundaiConfig, [{
      text: [
        "[경력] 커넥티드카 서비스 기획",
        "D-0",
        "#경력",
      ].join("\n"),
      url: "https://talent.hyundai.com/job/d-day-zero",
    }], "2026-05-30T00:00:00.000Z");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "커넥티드카 서비스 기획",
      endDate: "2026-05-30",
    });
  });

  it("uses stable IDs and hashes for page URL fallback blocks", () => {
    const text = [
      "Career",
      "JavaScript Only Engineer",
      "D-1",
    ].join("\n");
    const first = parseCandidateBlocks(
      { ...hyundaiConfig, requiredKeywords: ["Career"] },
      [{
        text,
        url: "https://talent.hyundai.com/apply?tab=jobs",
        urlIsPageFallback: true,
      }],
      "2026-05-30T00:00:00.000Z",
    )[0];
    const second = parseCandidateBlocks(
      { ...hyundaiConfig, requiredKeywords: ["Career"] },
      [{
        text,
        url: "https://talent.hyundai.com/apply?tab=changed",
        urlIsPageFallback: true,
      }],
      "2026-05-30T00:00:00.000Z",
    )[0];

    expect(first.url).toBe("https://talent.hyundai.com/apply?tab=jobs");
    expect(second.url).toBe("https://talent.hyundai.com/apply?tab=changed");
    expect(first.id).toBe(second.id);
    expect(first.contentHash).toBe(second.contentHash);
  });

  it("parses implicit-company career postings", () => {
    const result = parseCandidateBlocks(kiaConfig, [{
      text: "경력\n플랫폼 개발자\n접수기간 2026.05.30 ~ 2026.06.06",
      url: "https://career.kia.com/job/1",
    }], "2026-05-30T00:00:00.000Z");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      company: "Kia",
      title: "플랫폼 개발자",
      endDate: "2026-06-06",
      source: "kia",
    });
    expect(result[0].contentHash).toHaveLength(16);
  });

  it("parses default-company postings with Korean unit date ranges", () => {
    const result = parseCandidateBlocks(kiaConfig, [{
      text: "경력\n플랫폼 개발자\n접수기간 2026년 05월 30일 ~ 2026년 06월 06일",
      url: "https://career.kia.com/job/korean-date",
    }], "2026-05-30T00:00:00.000Z");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "플랫폼 개발자",
      endDate: "2026-06-06",
    });
  });

  it("rejects ambiguous default-company aggregate blocks", () => {
    const result = parseCandidateBlocks(kiaConfig, [{
      text: [
        "경력",
        "플랫폼 개발자",
        "2026.05.30 ~ 2026.06.06",
        "경력",
        "데이터 엔지니어",
        "2026.05.31 ~ 2026.06.07",
      ].join("\n"),
      url: "https://career.kia.com/apply/applyList.kc",
    }], "2026-05-30T00:00:00.000Z");

    expect(result).toEqual([]);
  });

  it("requires target company when default company is absent", () => {
    const result = parseCandidateBlocks(lgConfig, [{
      text: "LG에너지솔루션\n경력\n배터리 품질 엔지니어\n2026.05.30 ~ 2026.06.03",
      url: "https://careers.lg.com/job/2",
    }], "2026-05-30T00:00:00.000Z");

    expect(result[0]).toMatchObject({
      company: "LG Energy Solution",
      title: "배터리 품질 엔지니어",
    });
  });

  it("filters blocks without career keyword", () => {
    const result = parseCandidateBlocks(kiaConfig, [{
      text: "신입\n플랫폼 개발자\n2026.05.30 ~ 2026.06.06",
      url: "https://career.kia.com/job/1",
    }], "2026-05-30T00:00:00.000Z");

    expect(result).toEqual([]);
  });

  it("strips bracketed career labels from titles", () => {
    const result = parseCandidateBlocks(kiaConfig, [{
      text: "[경력] 플랫폼 개발자\n접수기간 2026.05.30 ~ 2026.06.06",
      url: "https://career.kia.com/job/3",
    }], "2026-05-30T00:00:00.000Z");

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("플랫폼 개발자");
  });

  it("strips inline career labels from titles", () => {
    const result = parseCandidateBlocks(kiaConfig, [{
      text: "경력직 플랫폼 개발자\n접수기간 2026.05.30 ~ 2026.06.06",
      url: "https://career.kia.com/job/4",
    }], "2026-05-30T00:00:00.000Z");

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("플랫폼 개발자");
  });

  it("rejects ambiguous aggregate blocks with multiple company postings", () => {
    const result = parseCandidateBlocks(lgConfig, [{
      text: [
        "LG전자",
        "경력",
        "플랫폼 개발자",
        "2026.05.30 ~ 2026.06.06",
        "LG에너지솔루션",
        "경력",
        "배터리 품질 엔지니어",
        "2026.05.31 ~ 2026.06.07",
      ].join("\n"),
      url: "https://careers.lg.com/apply",
    }], "2026-05-30T00:00:00.000Z");

    expect(result).toEqual([]);
  });

  it("rejects non-http posting urls", () => {
    const result = parseCandidateBlocks(kiaConfig, [{
      text: "경력\n플랫폼 개발자\n접수기간 2026.05.30 ~ 2026.06.06",
      url: "javascript:void(0)",
    }], "2026-05-30T00:00:00.000Z");

    expect(result).toEqual([]);
  });
});

async function withHtmlServer(html: string, run: (url: string) => Promise<void>): Promise<void> {
  const server = createServer((_, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}/apply`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}

async function withPagedHtmlServer(pages: Record<string, string>, run: (url: string) => Promise<void>): Promise<void> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const page = pages[`${url.pathname}${url.search}`] ?? pages[url.pathname];

    if (!page) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(page);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${address.port}/apply?page=1`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}
