// 채용 공고 수집, 비교, 저장, HTML 생성을 실행하는 CLI 진입점이다.
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadSiteConfigs } from "./config.js";
import { diffPostings } from "./diff.js";
import { generateHtml } from "./generate-html.js";
import { kstDateStamp } from "./date.js";
import { scrapeAllSites } from "./scrapers/index.js";
import { buildSnapshot, preserveFirstSeen, readSnapshot, writeHistory, writeSnapshot } from "./storage.js";
import type { JobPosting, SourceStatus } from "./model.js";

export async function main(): Promise<void> {
  const checkedAt = new Date().toISOString();
  const today = kstDateStamp(new Date(checkedAt));
  const previous = await readSnapshot();
  const sites = await loadSiteConfigs();
  const scraped = await scrapeAllSites(sites, checkedAt);
  const sources = protectUnexpectedIncompleteSources(previous, scraped.postings, scraped.sources);
  const anySuccess = sources.some((source) => source.ok);

  const currentPostings = anySuccess
    ? mergeScrapedPostings(previous?.postings ?? [], scraped.postings, sources)
    : previous?.postings ?? [];
  const snapshot = buildSnapshot(checkedAt, currentPostings, sources);
  const diff = diffPostings(previous?.postings ?? [], snapshot.postings, today);
  const sourceLinks = sites.map(({ source, url }) => ({ source, url }));

  await mkdir("public", { recursive: true });
  await writeFile("public/index.html", generateHtml(snapshot, diff, sourceLinks), "utf8");
  await writeFile("public/.nojekyll", "", "utf8");

  if (anySuccess) {
    await writeSnapshot(snapshot);
    await writeHistory(snapshot, today);
  }

  printSummary(snapshot.postings.length, sources.length, sources.filter((source) => !source.ok).length);
}

export function printSummary(postingCount: number, sourceCount: number, failedCount: number): void {
  console.log(`postings=${postingCount} sources=${sourceCount} failed=${failedCount}`);
}

if (isCliEntryPoint(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

function isCliEntryPoint(entryPath: string | undefined): boolean {
  return entryPath !== undefined && import.meta.url === pathToFileURL(entryPath).href;
}

function mergeScrapedPostings(
  previous: JobPosting[],
  scrapedPostings: JobPosting[],
  sources: SourceStatus[],
): JobPosting[] {
  const carriedSources = new Set(
    sources.filter((source) => !source.ok || isPreservedSource(source)).map((source) => source.source),
  );
  const scrapedIds = new Set(scrapedPostings.map((posting) => posting.id));
  const carriedPostings = previous.filter((posting) => carriedSources.has(posting.source) && !scrapedIds.has(posting.id));

  return preserveFirstSeen(previous, [...scrapedPostings, ...carriedPostings]);
}

function isPreservedSource(source: SourceStatus): source is SourceStatus & { preserved: true } {
  return "preserved" in source && source.preserved === true;
}

function protectUnexpectedIncompleteSources(
  previous: { postings: JobPosting[] } | null,
  scrapedPostings: JobPosting[],
  sources: SourceStatus[],
): SourceStatus[] {
  if (previous === null) return sources;

  const previousPostingCounts = countPostingsBySource(previous.postings);
  const scrapedPostingCounts = countPostingsBySource(scrapedPostings);

  return sources.map((source) => {
    const previousCount = previousPostingCounts.get(source.source) ?? 0;
    const scrapedCount = scrapedPostingCounts.get(source.source) ?? 0;

    if (!source.ok || previousCount === 0 || scrapedCount >= previousCount) {
      return source;
    }

    return {
      source: source.source,
      ok: true,
      checkedAt: source.checkedAt,
      postingCount: previousCount,
      preserved: true,
      message: `이번 수집이 ${scrapedCount}건으로 끝나 이전 공고 ${previousCount}건을 유지함`,
    };
  });
}

function countPostingsBySource(postings: JobPosting[]): Map<JobPosting["source"], number> {
  const counts = new Map<JobPosting["source"], number>();

  for (const posting of postings) {
    counts.set(posting.source, (counts.get(posting.source) ?? 0) + 1);
  }

  return counts;
}
