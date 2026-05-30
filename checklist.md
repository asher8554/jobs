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
