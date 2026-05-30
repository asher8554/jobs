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
