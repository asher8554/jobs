# Job Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily GitHub Pages dashboard that tracks selected Korean career job postings and highlights new, changed, and closing-soon postings.

**Architecture:** A Node.js TypeScript CLI runs in GitHub Actions, scrapes each source with Playwright, stores JSON snapshots under `data/`, and generates a self-contained `public/index.html`. Site failures are isolated per scraper, so one broken site does not block the dashboard.

**Tech Stack:** Node.js 20, TypeScript, Playwright Chromium, Vitest, GitHub Actions, GitHub Pages.

---

## File Structure

Create these files.

- `package.json`: npm scripts and dependencies.
- `tsconfig.json`: TypeScript build config.
- `vitest.config.ts`: Vitest config.
- `.gitignore`: dependency, build, and Playwright cache ignores.
- `config/sites.json`: target source and company rules.
- `src/model.ts`: shared data model.
- `src/hash.ts`: stable hash helpers.
- `src/config.ts`: site config loader.
- `src/diff.ts`: snapshot diff engine.
- `src/date.ts`: date parsing and KST helpers.
- `src/storage.ts`: snapshot and history read/write.
- `src/generate-html.ts`: static dashboard renderer.
- `src/scrapers/generic.ts`: Playwright-driven generic career page scraper.
- `src/scrapers/index.ts`: scraper orchestration.
- `src/scrapers/samsung.ts`: Samsung source wrapper.
- `src/scrapers/hyundai.ts`: Hyundai source wrapper.
- `src/scrapers/kia.ts`: Kia source wrapper.
- `src/scrapers/mobis.ts`: Mobis source wrapper.
- `src/scrapers/lg.ts`: LG source wrapper.
- `src/index.ts`: CLI entry point.
- `tests/hash.test.ts`: hash tests.
- `tests/diff.test.ts`: diff tests.
- `tests/date.test.ts`: date tests.
- `tests/html.test.ts`: HTML generation tests.
- `tests/scraper-generic.test.ts`: generic parser tests.
- `.github/workflows/update-jobs.yml`: daily and manual workflow.

Modify these files.

- `checklist.md`: mark implementation plan complete.
- `context-notes.md`: append implementation plan decision.

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create npm project files**

Write `package.json`.

```json
{
  "name": "jobs",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc --noEmit",
    "test": "vitest run",
    "update": "tsx src/index.ts",
    "scrape": "tsx src/index.ts --scrape-only"
  },
  "dependencies": {
    "playwright": "^1.52.0"
  },
  "devDependencies": {
    "@types/node": "^22.15.0",
    "tsx": "^4.19.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

Write `tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vitest.config.ts"]
}
```

Write `vitest.config.ts`.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
});
```

Write `.gitignore`.

```gitignore
node_modules/
dist/
.playwright/
test-results/
playwright-report/
npm-debug.log*
```

- [ ] **Step 2: Install dependencies**

Run.

```bash
npm install
```

Expected.

```text
added ... packages
found 0 vulnerabilities
```

This creates `package-lock.json`.

- [ ] **Step 3: Verify empty project commands**

Run.

```bash
npm run build
npm test
```

Expected build output.

```text
> jobs@0.1.0 build
> tsc --noEmit
```

Expected test output.

```text
No test files found
```

Vitest exits with code 1 when no tests exist. This is acceptable for this step only because tests are added in later tasks.

- [ ] **Step 4: Commit scaffold**

Run.

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore
git commit -m "chore: scaffold TypeScript job monitor"
```

Expected.

```text
[main ...] chore: scaffold TypeScript job monitor
```

---

### Task 2: Shared Model And Hashing

**Files:**
- Create: `src/model.ts`
- Create: `src/hash.ts`
- Create: `tests/hash.test.ts`

- [ ] **Step 1: Write model and hash tests**

Write `tests/hash.test.ts`.

```ts
// 채용 공고 해시 계산 규칙을 검증한다.
import { describe, expect, it } from "vitest";
import { buildContentHash, hashText } from "../src/hash.js";
import type { JobPosting } from "../src/model.js";

const baseJob: JobPosting = {
  id: "samsung-1",
  company: "Samsung Electronics DX",
  title: "Software Engineer",
  careerType: "career",
  startDate: "2026-05-01",
  endDate: "2026-06-05",
  url: "https://example.com/job/1",
  source: "samsung",
  firstSeenAt: "2026-05-30T00:00:00.000Z",
  lastSeenAt: "2026-05-30T00:00:00.000Z",
  contentHash: "",
};

describe("hash helpers", () => {
  it("returns stable short hashes", () => {
    expect(hashText("same")).toBe(hashText("same"));
    expect(hashText("same")).not.toBe(hashText("other"));
    expect(hashText("same")).toHaveLength(16);
  });

  it("changes content hash when important fields change", () => {
    const original = buildContentHash(baseJob);
    const changed = buildContentHash({ ...baseJob, endDate: "2026-06-10" });

    expect(changed).not.toBe(original);
  });

  it("ignores firstSeenAt and lastSeenAt in content hash", () => {
    const original = buildContentHash(baseJob);
    const changed = buildContentHash({
      ...baseJob,
      firstSeenAt: "2026-06-01T00:00:00.000Z",
      lastSeenAt: "2026-06-01T00:00:00.000Z",
    });

    expect(changed).toBe(original);
  });
});
```

- [ ] **Step 2: Run failing test**

Run.

```bash
npm test -- tests/hash.test.ts
```

Expected.

```text
Cannot find module '../src/hash.js'
```

- [ ] **Step 3: Add model and hash implementation**

Write `src/model.ts`.

```ts
// 채용 공고 수집과 비교에 사용하는 공통 데이터 모델을 정의한다.
export type JobSource = "samsung" | "hyundai" | "kia" | "mobis" | "lg";

export type CompanyName =
  | "Samsung Electronics DX"
  | "Samsung Electronics DS"
  | "Hyundai Motor Company"
  | "Kia"
  | "Hyundai Mobis"
  | "LG Electronics"
  | "LG Energy Solution";

export type JobPosting = {
  id: string;
  company: CompanyName;
  title: string;
  careerType: "career";
  startDate: string | null;
  endDate: string | null;
  url: string;
  source: JobSource;
  firstSeenAt: string;
  lastSeenAt: string;
  contentHash: string;
};

export type SourceSuccess = {
  source: JobSource;
  ok: true;
  checkedAt: string;
  postingCount: number;
};

export type SourceFailure = {
  source: JobSource;
  ok: false;
  checkedAt: string;
  message: string;
};

export type SourceStatus = SourceSuccess | SourceFailure;

export type Snapshot = {
  checkedAt: string;
  postings: JobPosting[];
  sources: SourceStatus[];
};

export type ChangedPosting = {
  before: JobPosting;
  after: JobPosting;
};

export type DiffResult = {
  newPostings: JobPosting[];
  changedPostings: ChangedPosting[];
  closingSoonPostings: JobPosting[];
  removedPostings: JobPosting[];
};
```

Write `src/hash.ts`.

```ts
// 채용 공고의 안정적인 식별자와 변경 감지용 해시를 만든다.
import { createHash } from "node:crypto";
import type { JobPosting } from "./model.js";

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function buildContentHash(posting: Pick<JobPosting, "company" | "title" | "endDate" | "url">): string {
  return hashText([
    posting.company,
    posting.title.trim().replace(/\s+/g, " "),
    posting.endDate ?? "",
    posting.url,
  ].join("|"));
}

export function buildPostingId(source: string, company: string, title: string, url: string): string {
  return `${source}-${hashText([company, title.trim().replace(/\s+/g, " "), url].join("|"))}`;
}
```

- [ ] **Step 4: Run hash test**

Run.

```bash
npm test -- tests/hash.test.ts
```

Expected.

```text
✓ tests/hash.test.ts
```

- [ ] **Step 5: Commit model and hash**

Run.

```bash
git add src/model.ts src/hash.ts tests/hash.test.ts
git commit -m "feat: add job posting model"
```

Expected.

```text
[main ...] feat: add job posting model
```

---

### Task 3: Date Helpers

**Files:**
- Create: `src/date.ts`
- Create: `tests/date.test.ts`

- [ ] **Step 1: Write date tests**

Write `tests/date.test.ts`.

```ts
// 채용 공고 날짜 파싱과 마감 임박 계산을 검증한다.
import { describe, expect, it } from "vitest";
import { daysUntil, extractDateRange, kstDateStamp } from "../src/date.js";

describe("date helpers", () => {
  it("extracts Korean dot date ranges", () => {
    expect(extractDateRange("2026.05.01 ~ 2026.06.05")).toEqual({
      startDate: "2026-05-01",
      endDate: "2026-06-05",
    });
  });

  it("extracts single deadline as endDate", () => {
    expect(extractDateRange("접수기간 2026-06-05까지")).toEqual({
      startDate: null,
      endDate: "2026-06-05",
    });
  });

  it("calculates days until deadline using UTC date parts", () => {
    expect(daysUntil("2026-06-06", "2026-05-30")).toBe(7);
  });

  it("formats KST date stamp", () => {
    expect(kstDateStamp(new Date("2026-05-30T00:30:00.000Z"))).toBe("2026-05-30");
  });
});
```

- [ ] **Step 2: Run failing test**

Run.

```bash
npm test -- tests/date.test.ts
```

Expected.

```text
Cannot find module '../src/date.js'
```

- [ ] **Step 3: Add date implementation**

Write `src/date.ts`.

```ts
// 채용 공고의 날짜 문자열을 표준 날짜로 정규화한다.
export type DateRange = {
  startDate: string | null;
  endDate: string | null;
};

export function normalizeDateText(value: string): string | null {
  const match = value.match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function extractDateRange(text: string): DateRange {
  const matches = [...text.matchAll(/20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}/g)]
    .map((match) => normalizeDateText(match[0]))
    .filter((date): date is string => date !== null);

  if (matches.length >= 2) {
    return { startDate: matches[0], endDate: matches[matches.length - 1] };
  }

  if (matches.length === 1) {
    return { startDate: null, endDate: matches[0] };
  }

  return { startDate: null, endDate: null };
}

export function daysUntil(endDate: string, today: string): number {
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const endTime = Date.UTC(endYear, endMonth - 1, endDay);
  const todayTime = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.ceil((endTime - todayTime) / 86_400_000);
}

export function kstDateStamp(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}
```

- [ ] **Step 4: Run date test**

Run.

```bash
npm test -- tests/date.test.ts
```

Expected.

```text
✓ tests/date.test.ts
```

- [ ] **Step 5: Commit date helpers**

Run.

```bash
git add src/date.ts tests/date.test.ts
git commit -m "feat: add job date helpers"
```

Expected.

```text
[main ...] feat: add job date helpers
```

---

### Task 4: Diff Engine

**Files:**
- Create: `src/diff.ts`
- Create: `tests/diff.test.ts`

- [ ] **Step 1: Write diff tests**

Write `tests/diff.test.ts`.

```ts
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
```

- [ ] **Step 2: Run failing test**

Run.

```bash
npm test -- tests/diff.test.ts
```

Expected.

```text
Cannot find module '../src/diff.js'
```

- [ ] **Step 3: Add diff implementation**

Write `src/diff.ts`.

```ts
// 이전 스냅샷과 현재 스냅샷을 비교해 화면 표시용 변경 목록을 만든다.
import { daysUntil } from "./date.js";
import type { DiffResult, JobPosting } from "./model.js";

export function diffPostings(
  previous: JobPosting[],
  current: JobPosting[],
  today: string,
  closingSoonDays = 7,
): DiffResult {
  const previousById = new Map(previous.map((posting) => [posting.id, posting]));
  const currentById = new Map(current.map((posting) => [posting.id, posting]));

  const newPostings = current.filter((posting) => !previousById.has(posting.id));

  const changedPostings = current
    .filter((posting) => previousById.has(posting.id))
    .map((posting) => ({ before: previousById.get(posting.id)!, after: posting }))
    .filter(({ before, after }) => before.contentHash !== after.contentHash);

  const closingSoonPostings = current.filter((posting) => {
    if (!posting.endDate) return false;
    const remainingDays = daysUntil(posting.endDate, today);
    return remainingDays >= 0 && remainingDays <= closingSoonDays;
  });

  const removedPostings = previous.filter((posting) => !currentById.has(posting.id));

  return {
    newPostings,
    changedPostings,
    closingSoonPostings,
    removedPostings,
  };
}
```

- [ ] **Step 4: Run diff test**

Run.

```bash
npm test -- tests/diff.test.ts
```

Expected.

```text
✓ tests/diff.test.ts
```

- [ ] **Step 5: Commit diff engine**

Run.

```bash
git add src/diff.ts tests/diff.test.ts
git commit -m "feat: add job diff engine"
```

Expected.

```text
[main ...] feat: add job diff engine
```

---

### Task 5: Site Config Loader

**Files:**
- Create: `config/sites.json`
- Create: `src/config.ts`

- [ ] **Step 1: Add site config**

Write `config/sites.json`.

```json
[
  {
    "source": "samsung",
    "url": "https://www.samsungcareers.com/hr/?ty=B",
    "defaultCompany": null,
    "companies": [
      { "name": "Samsung Electronics DX", "aliases": ["삼성전자 DX", "삼성전자 DX부문", "DX부문"] },
      { "name": "Samsung Electronics DS", "aliases": ["삼성전자 DS", "삼성전자 DS부문", "DS부문"] }
    ],
    "requiredKeywords": ["경력"],
    "excludedKeywords": ["관계사 선택", "지원 가이드", "나의 지원서", "회원가입"]
  },
  {
    "source": "hyundai",
    "url": "https://talent.hyundai.com/apply/applyList.hc",
    "defaultCompany": "Hyundai Motor Company",
    "companies": [],
    "requiredKeywords": ["경력"],
    "excludedKeywords": ["마이페이지", "지원서"]
  },
  {
    "source": "kia",
    "url": "https://career.kia.com/apply/applyList.kc",
    "defaultCompany": "Kia",
    "companies": [],
    "requiredKeywords": ["경력"],
    "excludedKeywords": ["마이페이지", "지원서"]
  },
  {
    "source": "mobis",
    "url": "https://careers.mobis.com/jobs",
    "defaultCompany": "Hyundai Mobis",
    "companies": [],
    "requiredKeywords": ["경력"],
    "excludedKeywords": ["Life", "People", "Story", "Guide"]
  },
  {
    "source": "lg",
    "url": "https://careers.lg.com/apply",
    "defaultCompany": null,
    "companies": [
      { "name": "LG Electronics", "aliases": ["LG전자", "엘지전자"] },
      { "name": "LG Energy Solution", "aliases": ["LG에너지솔루션", "LG Energy Solution"] }
    ],
    "requiredKeywords": ["경력"],
    "excludedKeywords": ["로그인", "지원서", "FAQ"]
  }
]
```

- [ ] **Step 2: Add config loader**

Write `src/config.ts`.

```ts
// 채용 사이트별 수집 조건을 설정 파일에서 읽는다.
import { readFile } from "node:fs/promises";
import type { CompanyName, JobSource } from "./model.js";

export type CompanyRule = {
  name: CompanyName;
  aliases: string[];
};

export type SiteConfig = {
  source: JobSource;
  url: string;
  defaultCompany: CompanyName | null;
  companies: CompanyRule[];
  requiredKeywords: string[];
  excludedKeywords: string[];
};

export async function loadSiteConfigs(path = "config/sites.json"): Promise<SiteConfig[]> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as SiteConfig[];
}
```

- [ ] **Step 3: Verify config loader by build**

Run.

```bash
npm run build
```

Expected.

```text
> jobs@0.1.0 build
> tsc --noEmit
```

- [ ] **Step 4: Commit config loader**

Run.

```bash
git add config/sites.json src/config.ts
git commit -m "feat: add monitored site config"
```

Expected.

```text
[main ...] feat: add monitored site config
```

---

### Task 6: Generic Scraper Parser

**Files:**
- Create: `src/scrapers/generic.ts`
- Create: `tests/scraper-generic.test.ts`

- [ ] **Step 1: Write generic parser tests**

Write `tests/scraper-generic.test.ts`.

```ts
// 채용 사이트에서 추출한 텍스트 블록을 공통 공고 모델로 바꾸는 규칙을 검증한다.
import { describe, expect, it } from "vitest";
import { parseCandidateBlocks } from "../src/scrapers/generic.js";
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
});
```

- [ ] **Step 2: Run failing test**

Run.

```bash
npm test -- tests/scraper-generic.test.ts
```

Expected.

```text
Cannot find module '../src/scrapers/generic.js'
```

- [ ] **Step 3: Add generic parser and Playwright scraper**

Write `src/scrapers/generic.ts`.

```ts
// 채용 사이트 화면에서 공고 후보를 추출하고 공통 모델로 정규화한다.
import type { Browser, Page } from "playwright";
import { buildContentHash, buildPostingId } from "../hash.js";
import type { SiteConfig } from "../config.js";
import { extractDateRange } from "../date.js";
import type { CompanyName, JobPosting, SourceStatus } from "../model.js";

export type CandidateBlock = {
  text: string;
  url: string;
};

export type ScrapeOutput = {
  postings: JobPosting[];
  status: SourceStatus;
};

export function parseCandidateBlocks(
  site: SiteConfig,
  blocks: CandidateBlock[],
  checkedAt: string,
): JobPosting[] {
  const postings = blocks
    .filter((block) => hasRequiredKeyword(block.text, site.requiredKeywords))
    .filter((block) => !hasExcludedKeyword(block.text, site.excludedKeywords))
    .map((block) => normalizeBlock(site, block, checkedAt))
    .filter((posting): posting is JobPosting => posting !== null);

  return [...new Map(postings.map((posting) => [posting.id, posting])).values()];
}

export async function scrapeGenericCareerPage(
  browser: Browser,
  site: SiteConfig,
  checkedAt: string,
): Promise<ScrapeOutput> {
  const page = await browser.newPage({
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  });

  try {
    await page.goto(site.url, { waitUntil: "networkidle", timeout: 60_000 });
    await clickLoadMore(page);
    const blocks = await collectCandidateBlocks(page);
    const postings = parseCandidateBlocks(site, blocks, checkedAt);

    return {
      postings,
      status: {
        source: site.source,
        ok: true,
        checkedAt,
        postingCount: postings.length,
      },
    };
  } catch (error) {
    return {
      postings: [],
      status: {
        source: site.source,
        ok: false,
        checkedAt,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  } finally {
    await page.close();
  }
}

function hasRequiredKeyword(text: string, requiredKeywords: string[]): boolean {
  return requiredKeywords.every((keyword) => text.includes(keyword));
}

function hasExcludedKeyword(text: string, excludedKeywords: string[]): boolean {
  return excludedKeywords.some((keyword) => text.includes(keyword));
}

function normalizeBlock(site: SiteConfig, block: CandidateBlock, checkedAt: string): JobPosting | null {
  const company = detectCompany(site, block.text);
  if (!company) return null;

  const title = extractTitle(block.text, company);
  if (!title) return null;

  const { startDate, endDate } = extractDateRange(block.text);
  const draft = {
    id: buildPostingId(site.source, company, title, block.url),
    company,
    title,
    careerType: "career" as const,
    startDate,
    endDate,
    url: block.url || site.url,
    source: site.source,
    firstSeenAt: checkedAt,
    lastSeenAt: checkedAt,
    contentHash: "",
  };

  return {
    ...draft,
    contentHash: buildContentHash(draft),
  };
}

function detectCompany(site: SiteConfig, text: string): CompanyName | null {
  if (site.defaultCompany) return site.defaultCompany;

  for (const company of site.companies) {
    if (company.aliases.some((alias) => text.includes(alias))) {
      return company.name;
    }
  }

  return null;
}

function extractTitle(text: string, company: CompanyName): string | null {
  const companyTokens = company.split(" ");
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .filter((line) => !line.includes("경력"))
    .filter((line) => !/20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}/.test(line))
    .filter((line) => !companyTokens.some((token) => token.length > 2 && line.includes(token)))
    .filter((line) => line.length >= 4 && line.length <= 120);

  return lines.sort((a, b) => b.length - a.length)[0] ?? null;
}

async function clickLoadMore(page: Page): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    const loadMore = page.getByText(/더보기|More|MORE/).first();
    if (!(await loadMore.isVisible().catch(() => false))) return;
    await loadMore.click({ timeout: 3_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);
  }
}

async function collectCandidateBlocks(page: Page): Promise<CandidateBlock[]> {
  return page.evaluate(() => {
    const selectors = "a[href], li, article, tr, [role='listitem'], [class*='card'], [class*='item']";
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selectors));
    const seen = new Set<string>();
    const blocks: CandidateBlock[] = [];

    for (const element of elements) {
      const text = (element.innerText ?? "").trim().replace(/\s+\n/g, "\n");
      if (text.length < 12 || text.length > 1200) continue;

      const anchor = element.matches("a[href]")
        ? (element as HTMLAnchorElement)
        : element.querySelector<HTMLAnchorElement>("a[href]");
      const href = anchor?.getAttribute("href") ?? location.href;
      const url = new URL(href, location.href).toString();
      const key = `${text}|${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      blocks.push({ text, url });
    }

    return blocks;
  });
}
```

- [ ] **Step 4: Run generic parser test**

Run.

```bash
npm test -- tests/scraper-generic.test.ts
```

Expected.

```text
✓ tests/scraper-generic.test.ts
```

- [ ] **Step 5: Commit generic scraper**

Run.

```bash
git add src/scrapers/generic.ts tests/scraper-generic.test.ts
git commit -m "feat: add generic career scraper"
```

Expected.

```text
[main ...] feat: add generic career scraper
```

---

### Task 7: Source Wrappers

**Files:**
- Create: `src/scrapers/samsung.ts`
- Create: `src/scrapers/hyundai.ts`
- Create: `src/scrapers/kia.ts`
- Create: `src/scrapers/mobis.ts`
- Create: `src/scrapers/lg.ts`
- Create: `src/scrapers/index.ts`

- [ ] **Step 1: Add source wrapper files**

Write `src/scrapers/samsung.ts`.

```ts
// 삼성 채용 사이트의 경력 공고를 수집한다.
import type { Browser } from "playwright";
import type { SiteConfig } from "../config.js";
import { scrapeGenericCareerPage } from "./generic.js";

export async function scrapeSamsung(browser: Browser, site: SiteConfig, checkedAt: string) {
  return scrapeGenericCareerPage(browser, site, checkedAt);
}
```

Write `src/scrapers/hyundai.ts`.

```ts
// 현대자동차 채용 사이트의 경력 공고를 수집한다.
import type { Browser } from "playwright";
import type { SiteConfig } from "../config.js";
import { scrapeGenericCareerPage } from "./generic.js";

export async function scrapeHyundai(browser: Browser, site: SiteConfig, checkedAt: string) {
  return scrapeGenericCareerPage(browser, site, checkedAt);
}
```

Write `src/scrapers/kia.ts`.

```ts
// 기아 채용 사이트의 경력 공고를 수집한다.
import type { Browser } from "playwright";
import type { SiteConfig } from "../config.js";
import { scrapeGenericCareerPage } from "./generic.js";

export async function scrapeKia(browser: Browser, site: SiteConfig, checkedAt: string) {
  return scrapeGenericCareerPage(browser, site, checkedAt);
}
```

Write `src/scrapers/mobis.ts`.

```ts
// 현대모비스 채용 사이트의 경력 공고를 수집한다.
import type { Browser } from "playwright";
import type { SiteConfig } from "../config.js";
import { scrapeGenericCareerPage } from "./generic.js";

export async function scrapeMobis(browser: Browser, site: SiteConfig, checkedAt: string) {
  return scrapeGenericCareerPage(browser, site, checkedAt);
}
```

Write `src/scrapers/lg.ts`.

```ts
// LG 채용 사이트의 경력 공고를 수집한다.
import type { Browser } from "playwright";
import type { SiteConfig } from "../config.js";
import { scrapeGenericCareerPage } from "./generic.js";

export async function scrapeLg(browser: Browser, site: SiteConfig, checkedAt: string) {
  return scrapeGenericCareerPage(browser, site, checkedAt);
}
```

- [ ] **Step 2: Add scraper orchestrator**

Write `src/scrapers/index.ts`.

```ts
// 사이트별 수집기를 실행하고 실패를 사이트 단위로 격리한다.
import { chromium } from "playwright";
import type { SiteConfig } from "../config.js";
import type { JobPosting, SourceStatus } from "../model.js";
import { scrapeSamsung } from "./samsung.js";
import { scrapeHyundai } from "./hyundai.js";
import { scrapeKia } from "./kia.js";
import { scrapeMobis } from "./mobis.js";
import { scrapeLg } from "./lg.js";

export type ScrapeRunResult = {
  postings: JobPosting[];
  sources: SourceStatus[];
};

export async function scrapeAllSites(sites: SiteConfig[], checkedAt: string): Promise<ScrapeRunResult> {
  const browser = await chromium.launch({ headless: true });
  const postings: JobPosting[] = [];
  const sources: SourceStatus[] = [];

  try {
    for (const site of sites) {
      const result = await scrapeOneSite(browser, site, checkedAt);
      postings.push(...result.postings);
      sources.push(result.status);
    }
  } finally {
    await browser.close();
  }

  return { postings, sources };
}

async function scrapeOneSite(browser: Awaited<ReturnType<typeof chromium.launch>>, site: SiteConfig, checkedAt: string) {
  switch (site.source) {
    case "samsung":
      return scrapeSamsung(browser, site, checkedAt);
    case "hyundai":
      return scrapeHyundai(browser, site, checkedAt);
    case "kia":
      return scrapeKia(browser, site, checkedAt);
    case "mobis":
      return scrapeMobis(browser, site, checkedAt);
    case "lg":
      return scrapeLg(browser, site, checkedAt);
  }
}
```

- [ ] **Step 3: Verify wrappers build**

Run.

```bash
npm run build
```

Expected.

```text
> jobs@0.1.0 build
> tsc --noEmit
```

- [ ] **Step 4: Commit source wrappers**

Run.

```bash
git add src/scrapers
git commit -m "feat: add source scraper wrappers"
```

Expected.

```text
[main ...] feat: add source scraper wrappers
```

---

### Task 8: Snapshot Storage

**Files:**
- Create: `src/storage.ts`

- [ ] **Step 1: Add storage implementation**

Write `src/storage.ts`.

```ts
// 채용 공고 스냅샷과 일별 이력 파일을 읽고 쓴다.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { JobPosting, Snapshot, SourceStatus } from "./model.js";

export async function readSnapshot(path = "data/snapshot.json"): Promise<Snapshot | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as Snapshot;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function preserveFirstSeen(previous: JobPosting[], current: JobPosting[]): JobPosting[] {
  const previousById = new Map(previous.map((posting) => [posting.id, posting]));

  return current.map((posting) => {
    const previousPosting = previousById.get(posting.id);
    return {
      ...posting,
      firstSeenAt: previousPosting?.firstSeenAt ?? posting.firstSeenAt,
    };
  });
}

export async function writeSnapshot(snapshot: Snapshot, path = "data/snapshot.json"): Promise<void> {
  await writeJson(path, snapshot);
}

export async function writeHistory(snapshot: Snapshot, dateStamp: string): Promise<void> {
  await writeJson(`data/history/${dateStamp}.json`, snapshot);
}

export function buildSnapshot(checkedAt: string, postings: JobPosting[], sources: SourceStatus[]): Snapshot {
  return {
    checkedAt,
    postings: postings.sort((a, b) => `${a.company}${a.endDate ?? ""}${a.title}`.localeCompare(`${b.company}${b.endDate ?? ""}${b.title}`)),
    sources,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
```

- [ ] **Step 2: Verify storage build**

Run.

```bash
npm run build
```

Expected.

```text
> jobs@0.1.0 build
> tsc --noEmit
```

- [ ] **Step 3: Commit storage**

Run.

```bash
git add src/storage.ts
git commit -m "feat: add snapshot storage"
```

Expected.

```text
[main ...] feat: add snapshot storage
```

---

### Task 9: HTML Dashboard Generator

**Files:**
- Create: `src/generate-html.ts`
- Create: `tests/html.test.ts`

- [ ] **Step 1: Write HTML tests**

Write `tests/html.test.ts`.

```ts
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
  newPostings: [{
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
  }],
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
```

- [ ] **Step 2: Run failing test**

Run.

```bash
npm test -- tests/html.test.ts
```

Expected.

```text
Cannot find module '../src/generate-html.js'
```

- [ ] **Step 3: Add HTML generator**

Write `src/generate-html.ts`.

```ts
// 채용 공고 변경 결과를 GitHub Pages용 정적 HTML로 렌더링한다.
import type { DiffResult, JobPosting, Snapshot, SourceStatus } from "./model.js";

export function generateHtml(snapshot: Snapshot, diff: DiffResult): string {
  const failedCount = snapshot.sources.filter((source) => !source.ok).length;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>채용 변경 모니터</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7f9; color: #1f2937; }
    header { padding: 24px; background: #0f172a; color: white; }
    main { width: min(1120px, calc(100% - 32px)); margin: 24px auto 48px; }
    h1, h2, h3 { margin: 0; }
    h2 { margin-top: 28px; margin-bottom: 12px; font-size: 20px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 18px; }
    .metric { background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.18); border-radius: 8px; padding: 12px; }
    .metric strong { display: block; font-size: 24px; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; box-shadow: 0 1px 2px rgba(15,23,42,.06); }
    .card a { color: #0f766e; font-weight: 700; text-decoration: none; }
    .meta { margin-top: 8px; color: #6b7280; font-size: 13px; line-height: 1.5; }
    .badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 700; margin-right: 6px; }
    .new { background: #dcfce7; color: #166534; }
    .changed { background: #fef3c7; color: #92400e; }
    .soon { background: #fee2e2; color: #991b1b; }
    .empty { color: #6b7280; background: white; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; }
  </style>
</head>
<body>
  <header>
    <h1>채용 변경 모니터</h1>
    <p>마지막 체크: ${escapeHtml(snapshot.checkedAt)}</p>
    <div class="summary">
      ${metric("전체", snapshot.postings.length)}
      ${metric("신규", diff.newPostings.length)}
      ${metric("변경", diff.changedPostings.length)}
      ${metric("마감임박", diff.closingSoonPostings.length)}
      ${metric("실패 소스", failedCount)}
    </div>
  </header>
  <main>
    ${section("신규 공고", renderPostingCards(diff.newPostings, "new", "신규"))}
    ${section("변경 공고", renderChangedCards(diff.changedPostings))}
    ${section("마감임박", renderPostingCards(diff.closingSoonPostings, "soon", "마감임박"))}
    ${section("회사별 전체 공고", renderGroupedPostings(snapshot.postings))}
    ${section("사라진 공고", renderPostingCards(diff.removedPostings, "changed", "사라짐"))}
    ${section("Source status", renderSourceStatus(snapshot.sources))}
  </main>
</body>
</html>`;
}

function metric(label: string, value: number): string {
  return `<div class="metric">${escapeHtml(label)}<strong>${value}</strong></div>`;
}

function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body || `<div class="empty">표시할 항목이 없습니다.</div>`}</section>`;
}

function renderPostingCards(postings: JobPosting[], badgeClass: string, badgeLabel: string): string {
  if (postings.length === 0) return "";
  return `<div class="grid">${postings.map((posting) => renderPostingCard(posting, badgeClass, badgeLabel)).join("")}</div>`;
}

function renderChangedCards(changes: DiffResult["changedPostings"]): string {
  if (changes.length === 0) return "";
  return `<div class="grid">${changes.map(({ before, after }) => `${renderPostingCard(after, "changed", "변경")}<div class="meta">이전 제목: ${escapeHtml(before.title)}<br>이전 마감: ${escapeHtml(before.endDate ?? "-")}</div>`).join("")}</div>`;
}

function renderGroupedPostings(postings: JobPosting[]): string {
  if (postings.length === 0) return "";
  const groups = new Map<string, JobPosting[]>();
  for (const posting of postings) {
    groups.set(posting.company, [...(groups.get(posting.company) ?? []), posting]);
  }

  return [...groups.entries()].map(([company, companyPostings]) => `<h3>${escapeHtml(company)}</h3>${renderPostingCards(companyPostings, "new", "경력")}`).join("");
}

function renderPostingCard(posting: JobPosting, badgeClass: string, badgeLabel: string): string {
  return `<article class="card">
    <span class="badge ${badgeClass}">${escapeHtml(badgeLabel)}</span>
    <a href="${escapeHtml(posting.url)}" target="_blank" rel="noreferrer">${escapeHtml(posting.title)}</a>
    <div class="meta">회사: ${escapeHtml(posting.company)}<br>마감: ${escapeHtml(posting.endDate ?? "-")}<br>출처: ${escapeHtml(posting.source)}</div>
  </article>`;
}

function renderSourceStatus(sources: SourceStatus[]): string {
  if (sources.length === 0) return "";
  return `<div class="grid">${sources.map((source) => `<article class="card">
    <strong>${escapeHtml(source.source)}</strong>
    <div class="meta">${source.ok ? `성공: ${source.postingCount}건` : `실패: ${escapeHtml(source.message)}`}<br>${escapeHtml(source.checkedAt)}</div>
  </article>`).join("")}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
```

- [ ] **Step 4: Run HTML test**

Run.

```bash
npm test -- tests/html.test.ts
```

Expected.

```text
✓ tests/html.test.ts
```

- [ ] **Step 5: Commit HTML generator**

Run.

```bash
git add src/generate-html.ts tests/html.test.ts
git commit -m "feat: add dashboard generator"
```

Expected.

```text
[main ...] feat: add dashboard generator
```

---

### Task 10: CLI Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Add CLI implementation**

Write `src/index.ts`.

```ts
// 채용 공고 수집, 비교, 저장, HTML 생성을 실행하는 CLI 진입점이다.
import { mkdir, writeFile } from "node:fs/promises";
import { loadSiteConfigs } from "./config.js";
import { diffPostings } from "./diff.js";
import { generateHtml } from "./generate-html.js";
import { kstDateStamp } from "./date.js";
import { scrapeAllSites } from "./scrapers/index.js";
import { buildSnapshot, preserveFirstSeen, readSnapshot, writeHistory, writeSnapshot } from "./storage.js";

async function main(): Promise<void> {
  const checkedAt = new Date().toISOString();
  const today = kstDateStamp(new Date(checkedAt));
  const previous = await readSnapshot();
  const sites = await loadSiteConfigs();
  const scraped = await scrapeAllSites(sites, checkedAt);
  const anySuccess = scraped.sources.some((source) => source.ok);

  const currentPostings = anySuccess
    ? preserveFirstSeen(previous?.postings ?? [], scraped.postings)
    : previous?.postings ?? [];
  const snapshot = buildSnapshot(checkedAt, currentPostings, scraped.sources);
  const diff = diffPostings(previous?.postings ?? [], snapshot.postings, today);

  await mkdir("public", { recursive: true });
  await writeFile("public/index.html", generateHtml(snapshot, diff), "utf8");
  await writeFile("public/.nojekyll", "", "utf8");

  if (anySuccess) {
    await writeSnapshot(snapshot);
    await writeHistory(snapshot, today);
  }

  printSummary(snapshot.postings.length, scraped.sources.length, scraped.sources.filter((source) => !source.ok).length);
}

function printSummary(postingCount: number, sourceCount: number, failedCount: number): void {
  console.log(`postings=${postingCount} sources=${sourceCount} failed=${failedCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 2: Build CLI**

Run.

```bash
npm run build
```

Expected.

```text
> jobs@0.1.0 build
> tsc --noEmit
```

- [ ] **Step 3: Run CLI smoke test**

Run.

```bash
npx playwright install chromium
npm run update
```

Expected.

```text
postings=... sources=5 failed=...
```

Expected files.

```text
data/snapshot.json
data/history/YYYY-MM-DD.json
public/index.html
public/.nojekyll
```

- [ ] **Step 4: Commit CLI**

Run.

```bash
git add src/index.ts data public
git commit -m "feat: add job monitor CLI"
```

Expected.

```text
[main ...] feat: add job monitor CLI
```

---

### Task 11: GitHub Actions And Pages

**Files:**
- Create: `.github/workflows/update-jobs.yml`

- [ ] **Step 1: Add workflow**

Write `.github/workflows/update-jobs.yml`.

```yaml
name: Update jobs

on:
  schedule:
    - cron: "0 0 * * *"
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npx playwright install --with-deps chromium

      - run: npm test

      - run: npm run build

      - run: npm run update

      - name: Commit generated data
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data public
          git diff --cached --quiet || git commit -m "chore: update job snapshot"
          git push

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: public

      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Verify workflow YAML is tracked**

Run.

```bash
git status --short
```

Expected.

```text
?? .github/
```

- [ ] **Step 3: Commit workflow**

Run.

```bash
git add .github/workflows/update-jobs.yml
git commit -m "ci: add daily job monitor workflow"
```

Expected.

```text
[main ...] ci: add daily job monitor workflow
```

---

### Task 12: Final Verification

**Files:**
- Modify: `checklist.md`
- Modify: `context-notes.md`

- [ ] **Step 1: Run complete local verification**

Run.

```bash
npm test
npm run build
npm run update
```

Expected.

```text
✓ tests/hash.test.ts
✓ tests/date.test.ts
✓ tests/diff.test.ts
✓ tests/scraper-generic.test.ts
✓ tests/html.test.ts
postings=... sources=5 failed=...
```

- [ ] **Step 2: Inspect generated dashboard**

Open `public/index.html` in a browser or use a local static server.

Run.

```bash
npx http-server public -p 4173
```

Expected.

```text
Available on:
  http://127.0.0.1:4173
```

Verify page shows.

```text
채용 변경 모니터
신규 공고
변경 공고
마감임박
회사별 전체 공고
Source status
```

- [ ] **Step 3: Update work log**

Edit `checklist.md`.

```markdown
- [x] Write implementation plan.
- [x] Implement scraper and dashboard.
- [x] Run tests and build.
- [x] Commit implementation.
```

Append to `context-notes.md`.

```markdown
## 2026-05-30 Implementation

- Implemented TypeScript CLI using Playwright, Vitest, and static HTML generation.
- GitHub Actions runs at 09:00 KST through cron `0 0 * * *`.
- Generated dashboard is deployed from `public/`.
- Generated JSON snapshots are committed under `data/`.
```

- [ ] **Step 4: Commit final log update**

Run.

```bash
git add checklist.md context-notes.md
git commit -m "docs: update job monitor work log"
```

Expected.

```text
[main ...] docs: update job monitor work log
```

- [ ] **Step 5: Push to GitHub**

Run.

```bash
git push -u origin main
```

Expected.

```text
branch 'main' set up to track 'origin/main'
```

After push, set GitHub Pages source to GitHub Actions in repository settings if it is not already enabled. Then run the `Update jobs` workflow manually once.

---

## Self-Review

- Spec coverage. The plan covers daily GitHub Actions, target source config, career-only filtering, Samsung and LG company filtering, snapshots, history, diff rules, generated HTML, source failure isolation, and tests.
- Placeholder scan. No implementation step uses deferred placeholders. Site-specific scraper behavior is implemented through a generic Playwright parser with source config.
- Type consistency. `JobPosting`, `Snapshot`, `SourceStatus`, and `DiffResult` are defined once in `src/model.ts` and used by later tasks.
