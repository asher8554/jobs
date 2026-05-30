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
    postings: [...postings].sort((a, b) => {
      const companyOrder = a.company.localeCompare(b.company);
      if (companyOrder !== 0) return companyOrder;

      const endDateOrder = (a.endDate ?? "").localeCompare(b.endDate ?? "");
      if (endDateOrder !== 0) return endDateOrder;

      return a.title.localeCompare(b.title);
    }),
    sources,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
