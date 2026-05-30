// 채용 공고 수집, 비교, 저장, HTML 생성을 실행하는 CLI 진입점이다.
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { loadSiteConfigs } from "./config.js";
import { diffPostings } from "./diff.js";
import { generateHtml } from "./generate-html.js";
import { kstDateStamp } from "./date.js";
import { scrapeAllSites } from "./scrapers/index.js";
import { buildSnapshot, preserveFirstSeen, readSnapshot, writeHistory, writeSnapshot } from "./storage.js";

export async function main(): Promise<void> {
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
