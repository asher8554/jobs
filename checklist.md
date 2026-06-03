# Checklist

- [x] Confirm target repository.
- [x] Confirm tracked companies.
- [x] Confirm posting type.
- [x] Confirm dashboard emphasis.
- [x] Approve architecture.
- [x] Approve data model and screen structure.
- [x] Approve schedule and failure policy.
- [x] Write design document.
- [x] Review design document.
- [x] Write implementation plan.
- [x] Implement scraper and dashboard.
- [x] Run tests and build.
- [x] Commit implementation.

## Task 12 Live Update Blocker

- [x] Add Playwright regression for `scrapeGenericCareerPage` under `tsx`.
- [x] Move candidate block collection to a raw browser JavaScript expression.
- [x] Remove failed-run generated `public/` output.
- [x] Run scoped test, full test, build, and live update.
- [x] Commit blocker fix.

## Live Parser Mismatch After `__name` Fix

- [x] Add failing parser coverage for Hyundai live card metadata, D-day deadlines, and zero-result status.
- [x] Fix generic parser title filtering, D-day end dates, and zero-result policy.
- [x] Run scoped generic scraper test.
- [x] Run full tests, build, and live update.
- [x] Commit parser fix.

## Final Review Fixes

- [x] Add regression tests for partial scrape failure, ambiguous zero results, and fallback URLs.
- [x] Preserve previous postings for failed sources during partial runs.
- [x] Tighten zero-posting success policy.
- [x] Stabilize IDs for JavaScript-only list URL fallbacks.
- [x] Preserve posting history across generated ID migrations.
- [x] Run full tests, build, and live update.
- [x] Commit final review fixes.

## Pagination Scrape Fix

- [x] Add regression coverage for numbered or next-button pagination.
- [x] Update the generic scraper to collect every reachable page before parsing status.
- [x] Run scoped generic scraper test.
- [x] Run full tests, build, and live update.
- [x] Commit pagination fix.

## Dark Mode Dashboard

- [x] Add HTML generator coverage for theme controls and dark palette.
- [x] Add light, dark, and stored-theme rendering support to the generated dashboard.
- [x] Regenerate `public/index.html`.
- [x] Run tests, build, and rendered Playwright QA.
- [x] Commit dark mode dashboard update.

## Career Site Source Review

- [x] Add HTML generator coverage for source quick links.
- [x] Pass configured source URLs into the generated dashboard.
- [x] Update Hyundai and Kia config URLs to the filtered career pages provided by the user.
- [x] Recheck Samsung, Hyundai, Kia, Mobis, and LG live pages across all pages.
- [x] Fix parser gaps found during live recheck.
- [x] Run tests, build, live update, and rendered QA.
- [x] Commit source review update.

## GitHub Runner Zero-Result Guard

- [x] Add regression coverage for a previously populated source returning `success: 0`.
- [x] Treat unexpected `success: 0` as a source failure so previous postings are preserved.
- [x] Run full tests and build.
- [x] Regenerate the local live snapshot before push.

## Preserved Source Status

- [x] Add a structured preserved source status.
- [x] Render preserved sources as `보존` instead of `FAIL`.
- [x] Keep preserved sources out of the failed source count.
- [x] Run build, full tests, and live update.
