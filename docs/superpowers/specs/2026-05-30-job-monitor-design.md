# Job Monitor Design

## Goal

Build a GitHub Pages based job monitor for selected Korean career sites. The monitor checks career job postings every day, detects new, changed, and closing-soon postings, and renders a simple HTML dashboard.

## Approved Scope

- Track career postings only.
- Track all career job functions, without keyword filtering.
- Show new postings, changed postings, closing-soon postings, and current postings by company.
- Run automatically once per day.
- Publish results through GitHub Pages from the `asher8554/jobs` repository.

## Target Sites

| Source | URL | Included companies |
| --- | --- | --- |
| Samsung Careers | `https://www.samsungcareers.com/hr/?ty=B` | Samsung Electronics DX, Samsung Electronics DS |
| Hyundai Careers | `https://talent.hyundai.com/apply/applyList.hc` | Hyundai Motor Company |
| Kia Careers | `https://career.kia.com/apply/applyList.kc` | Kia |
| Hyundai Mobis Careers | `https://careers.mobis.com/jobs` | Hyundai Mobis |
| LG Careers | `https://careers.lg.com/apply` | LG Electronics, LG Energy Solution |

## Architecture

Use a static-site-first architecture.

GitHub Actions runs the scraper every day. The scraper collects postings from each source, normalizes them into one JSON schema, compares the result with the previous snapshot, writes updated data files, and regenerates `public/index.html`. GitHub Pages serves the generated HTML.

Each source has its own scraper module. A failure in one scraper must not prevent other sources from being collected. The generated dashboard shows failed sources and the last successful data for unaffected sources.

## Repository Structure

```text
.
|-- .github/workflows/update-jobs.yml
|-- config/sites.json
|-- data/history/YYYY-MM-DD.json
|-- data/snapshot.json
|-- package.json
|-- public/index.html
|-- src/diff.ts
|-- src/generate-html.ts
|-- src/index.ts
|-- src/scrapers/kia.ts
|-- src/scrapers/lg.ts
|-- src/scrapers/mobis.ts
|-- src/scrapers/samsung.ts
|-- src/scrapers/hyundai.ts
`-- tests/
```

## Data Model

```ts
type JobPosting = {
  id: string;
  company: string;
  title: string;
  careerType: "career";
  startDate: string | null;
  endDate: string | null;
  url: string;
  source: "samsung" | "hyundai" | "kia" | "mobis" | "lg";
  firstSeenAt: string;
  lastSeenAt: string;
  contentHash: string;
};
```

`id` uses the source posting ID when available. If a source does not expose a stable ID, use a hash of source, company, title, and URL.

`contentHash` uses company, title, end date, and URL. A changed hash for the same `id` means the posting changed.

## Change Rules

- New. Posting exists in current snapshot but not previous snapshot.
- Changed. Posting has same `id`, but `contentHash` changed.
- Closing soon. Posting has `endDate` within 7 days from collection date.
- Removed. Posting existed in previous snapshot but not current snapshot.

Removed postings appear in a separate section, not mixed with active postings.

## Dashboard

`public/index.html` is generated as a self-contained static page.

Top summary shows last check time, active posting count, new count, changed count, closing-soon count, and failed source count.

Main sections.

1. New postings.
2. Changed postings.
3. Closing-soon postings.
4. Active postings grouped by company.
5. Removed postings.
6. Source status.

Cards are preferred over wide tables so the page works on mobile. Each card links to the source posting.

## Schedule

GitHub Actions runs daily at 09:00 Korea Standard Time. Because GitHub Actions cron uses UTC, schedule should be `0 0 * * *`.

The workflow also supports manual dispatch.

## Failure Handling

Each scraper returns either normalized postings or a source-level failure. The aggregator records failures and continues with other sources.

If at least one source succeeds, regenerate dashboard with successful results and visible failure messages. If every source fails, keep the previous snapshot and generate a dashboard showing the failed run.

## Testing

Required tests.

- Parser tests for normalized `JobPosting` output per source.
- Diff tests for new, changed, closing-soon, and removed states.
- HTML generation test for expected summary sections.

Before marking implementation complete, run the project test command and a build command.

## Implementation Notes

No open product decisions remain from the approved design. Implementation may still require site-specific technical choices after inspecting each site's network behavior.
