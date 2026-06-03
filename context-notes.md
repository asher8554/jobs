# Context Notes

## 2026-05-30

- User wants a GitHub Pages dashboard for noticing changes in career postings.
- Repository is `https://github.com/asher8554/jobs`.
- Repository was empty when checked.
- Local working folder is a NAS path, not a Git repository.
- Target posting type is career postings only.
- Keyword filtering is out of scope for now.
- Dashboard should highlight new, changed, and closing-soon postings.
- Samsung scope is Samsung Electronics DX and Samsung Electronics DS.
- LG scope is LG Electronics and LG Energy Solution.
- Approved approach is GitHub Actions plus static HTML plus JSON snapshots.
- Approved schedule is daily at 09:30 KST.
- Closing-soon threshold is 7 days.
- One site failing should not block other sites.
- User approved the design document and asked to continue.
- Implementation plan uses TypeScript, Vitest, Playwright Chromium, GitHub Actions, and generated static HTML.
- Source-specific scrapers will start as thin wrappers over a generic Playwright career-page parser, with config-driven company and keyword filtering.
- On UNC/NAS workspaces, use `powershell -ExecutionPolicy Bypass -File scripts/run-npm.ps1 run build` and `powershell -ExecutionPolicy Bypass -File scripts/run-npm.ps1 test` so `cmd` maps the repo path before invoking npm/Vitest.

## 2026-05-30 Implementation

- Implemented TypeScript CLI using Playwright, Vitest, and static HTML generation.
- GitHub Actions runs at 09:30 KST through cron `30 0 * * *`.
- Generated dashboard is deployed from `public/`.
- Generated JSON snapshots are committed under `data/` when at least one source succeeds.
- Final verification: `powershell -ExecutionPolicy Bypass -File scripts/run-npm.ps1 test` exited 0 with 9 test files and 63 tests passed; `powershell -ExecutionPolicy Bypass -File scripts/run-npm.ps1 run build` exited 0 with `tsc --noEmit`; `powershell -ExecutionPolicy Bypass -File scripts/run-npm.ps1 run update` exited 0 but reported `postings=0 sources=5 failed=5`, so live update is not verified as successful. `npx playwright install chromium` was not needed because Chromium launched and reached `page.evaluate`. All five sources failed with `page.evaluate: ReferenceError: __name is not defined`; no `data/` snapshot was generated, and failed-run dashboard files were left under `public/` for final review.

## 2026-05-30 Task 12 Live Update Blocker

- Confirmed root cause from the failed live run and minimal repro: `tsx`/esbuild can inject a `__name(...)` helper inside functions passed to `page.evaluate`, and the browser context does not define that helper.
- Fix scope is limited to the generic scraper browser evaluation path plus a regression test that exercises `scrapeGenericCareerPage` through Playwright Chromium.
- Implemented `collectCandidateBlocks` as a raw self-contained JavaScript expression passed to `page.evaluate`, with the TypeScript side only casting the serializable result.
- Added a Playwright Chromium regression around a `data:text/html` Kia posting page. The test passes with the raw-string implementation and keeps the scrape path covered.
- Validation completed: scoped scraper test exited 0 with 10 tests passed; full test suite exited 0 with 9 files and 64 tests passed; build exited 0 with `tsc --noEmit`; live update exited 0 with `postings=0 sources=5 failed=5`.
- Live update failure messages no longer mention `__name`; the generated status page reported site/parser-specific failures: 14, 7, 20, and 171 candidate blocks parsed into no postings, plus one source with no candidate blocks.
- Generated `public/` output from validation was removed again so it is not included in the fix commit.

## 2026-05-30 Live Parser Mismatch After `__name` Fix

- Root cause evidence from live samples points to generic title extraction treating card metadata as title candidates: campaign labels such as `5월 경력채용`, UI labels such as `공유`, D-day lines such as `D-1`, and hashtag metadata all survive the current filters.
- Hyundai has a default company, so multiple title candidates make one real posting block look ambiguous and get rejected by `isAmbiguousDefaultCompanyBlock`.
- Current zero-result status policy marks sources failed when parser filters find no target postings. That is too strict for current live pages where target-company or career postings can validly be zero.
- Additional live tracing showed Hyundai posting cards use `javascript:void(0)` anchors and render after the initial navigation/filter elements. The generic collector needs a page-URL fallback plus bounded delayed-row handling for default-company sites.
- Final validation completed: scoped scraper test exited 0 with 16 tests passed; full suite exited 0 with 9 files and 70 tests passed; build exited 0 with `tsc --noEmit`; live update exited 0 with `postings=8 sources=5 failed=0`.
- Live snapshot source counts were Samsung 0, Hyundai 8, Kia 0, Mobis 0, and LG 0. Hyundai included `제조경쟁력 강화 전략 수립` with end date `2026-05-31`.

## 2026-05-30 Initial Snapshot

- Final local verification passed with 9 test files and 70 tests, then `tsc --noEmit`, then live update.
- Initial live update generated `data/snapshot.json`, `data/history/2026-05-30.json`, `public/index.html`, and `public/.nojekyll`.
- Initial generated dashboard contains 8 active Hyundai Motor Company career postings and 0 failed sources.

## 2026-05-30 Final Review Fixes

- Added regression coverage for partial scrape failure, parser-zero ambiguity, JavaScript-only page URL fallbacks, and generated ID migration.
- Partial runs now carry forward previous postings for failed sources so a transient source failure does not erase that source from the committed snapshot.
- Zero-posting status is now success only when the page explicitly reports no postings, no career rows are present, or target-company filters confidently find no rows. Required-keyword blocks that cannot be parsed are recorded as source failures.
- JavaScript-only posting cards still link to the list page, but generated IDs and content hashes use a query-stripped identity URL so filter query churn does not create false new postings.
- Diffing and `firstSeenAt` preservation now match unique postings by source, company, and normalized title when generated IDs change.
- LG Careers uses text-only MUI cards that are not anchors or list items, so the generic scraper now has a line-based fallback for `company -> title -> D-day/date` blocks.
- The LG fallback was tightened after a false-positive check so repeated metadata company lines cannot attach the following non-target career card.
- Final validation passed with 9 test files and 78 tests, then `tsc --noEmit`, then live update. Live update reported `postings=13 sources=5 failed=0`: Hyundai 8, LG 5, Samsung/Kia/Mobis 0.
- After merging to main, Vitest initially picked up the nested `.worktrees/` copy and ran tests twice, so `vitest.config.ts` now excludes `.worktrees/**`. Main validation then passed with 9 test files and 78 tests, followed by `tsc --noEmit`.
- Schedule changed from 09:00 KST to 09:30 KST by updating GitHub Actions cron from `0 0 * * *` to `30 0 * * *`.

## 2026-06-03 Pagination Scrape Fix

- User noticed the scraper appears to find the career list but does not advance through multiple pages.
- Current generic scraper only clicks load-more controls before one collection pass, so numbered pagination and next-button pagination can miss later pages.
- Fix scope is limited to `src/scrapers/generic.ts` plus regression coverage in `tests/scraper-generic.test.ts`.
- Added a Playwright regression with a two-page Kia-style list. It failed before the scraper changed because only the first page posting was returned.
- The generic scraper now repeats the existing load-more, signal wait, collection, and parsing sequence per page, then clicks a usable next-page control until no next page is reachable or the 50-page guard is hit.
- Validation passed after rebasing onto latest `origin/main`: full test suite exited 0 with 9 files and 79 tests; build exited 0 with `tsc --noEmit`; live update exited 0 with `postings=6 sources=5 failed=0`.
- Live update source counts on 2026-06-03 were Samsung 0, Hyundai 0, Kia 1, Mobis 0, and LG 5.

## 2026-06-03 Career Site Source Review

- User asked to recheck Samsung, Hyundai, Kia, Mobis, and LG against specific career-list URLs, including all pagination pages.
- User also asked the generated Page to include an easy button linking to each current source URL.
- Chrome-backed verification is blocked in this session because Chrome is not running and the Codex Chrome Extension is missing from the checked profile, so public page verification will use the project Playwright runtime.
- Scope starts with `config/sites.json`, `src/index.ts`, `src/generate-html.ts`, generated `public/index.html`, targeted parser fixes if the live recheck exposes gaps, and work logs.
- Assumption: dashboard quick links should point to the exact configured source URLs used by the scraper, so future filter URL changes stay visible on the Page.
- Added dashboard source quick links for Samsung, Hyundai, Kia, Mobis, and LG, using the exact configured scraper URLs.
- Live recheck found Samsung has 4 visible career postings but none under Samsung Electronics DX/DS, so monitored Samsung count remains 0.
- Live recheck found Hyundai career pagination spans multiple pages; after treating `채용시까지` as deadline metadata, the scraper collected 30 Hyundai career postings including 8 battery-related postings.
- Live recheck found Kia has 1 visible posting, but it is contract work and not a career posting; the monitored Kia count remains 0. A false positive from the filter label `신입 경력 인턴 계약직 기타` was blocked by requiring a deadline signal.
- Live recheck found Mobis has 0 active postings, matching the monitored count.
- Live recheck found LG Electronics and LG Energy Solution have 8 visible postings in total, but 3 are non-career 산학장학생 or 인턴 postings; the monitored LG career count is 5.
- GitHub Actions initially scraped Hyundai as a successful 0-posting source and overwrote the generated Page, so default-company pages with nearby required-keyword rows and deadline signals are now treated as scrape failures when no posting blocks parse; this preserves the previous source postings instead of erasing them.
- Pagination is now normalized back to page 1 before scraping and then advances by numeric page buttons before falling back to a next button. This stabilizes Hyundai's multi-page career list.
- Final validation passed: full test suite exited 0 with 9 files and 86 tests; build exited 0 with `tsc --noEmit`; live update exited 0 with `postings=35 sources=5 failed=0`.
- Rendered Playwright QA over a temporary local HTTP server confirmed 5 source quick links, Hyundai battery postings, dark-mode persistence, no desktop or mobile overflow, and no console warnings/errors.

## 2026-06-03 Dark Mode Dashboard

- User asked to add dark mode to the job dashboard.
- Assumption: the static dashboard should respect OS dark preference and also provide a visible manual light/dark toggle saved in `localStorage`.
- Scope is limited to `src/generate-html.ts`, `tests/html.test.ts`, generated `public/index.html`, and work logs.
- Added CSS custom properties for light and dark palettes, a header switch labeled `다크 모드`, pre-paint theme initialization, and `localStorage` persistence.
- Rendered QA used regular Playwright because the Browser plugin was not available in this session. Initial QA found the hidden checkbox click was blocked by the slider; fixed by making the whole switch label a checkbox hit area.
- Final validation passed: `tests/html.test.ts` exited 0 with 6 tests; full suite exited 0 with 9 files and 80 tests; build exited 0 with `tsc --noEmit`; live update exited 0 with `postings=5 sources=5 failed=0`.
- Playwright rendered QA confirmed title `채용 변경 모니터`, no console warnings/errors, dark toggle sets and stores `jobs-theme=dark`, reload preserves dark mode, and the mobile dark-mode switch stays within the header.
