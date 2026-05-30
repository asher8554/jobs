// 채용 사이트에서 추출한 텍스트 블록을 공통 공고 모델로 바꾸는 규칙을 검증한다.
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
});

describe("parseCandidateBlocks", () => {
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
