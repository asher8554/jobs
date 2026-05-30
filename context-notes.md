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
- Approved schedule is daily at 09:00 KST.
- Closing-soon threshold is 7 days.
- One site failing should not block other sites.
- User approved the design document and asked to continue.
- Implementation plan uses TypeScript, Vitest, Playwright Chromium, GitHub Actions, and generated static HTML.
- Source-specific scrapers will start as thin wrappers over a generic Playwright career-page parser, with config-driven company and keyword filtering.
- On UNC/NAS workspaces, use `powershell -ExecutionPolicy Bypass -File scripts/run-npm.ps1 run build` and `powershell -ExecutionPolicy Bypass -File scripts/run-npm.ps1 test` so `cmd` maps the repo path before invoking npm/Vitest.

## 2026-05-30 Implementation

- Implemented TypeScript CLI using Playwright, Vitest, and static HTML generation.
- GitHub Actions runs at 09:00 KST through cron `0 0 * * *`.
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
