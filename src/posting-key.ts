// 공고 ID가 바뀌어도 같은 공고를 찾기 위한 자연 키 도우미다.
import type { JobPosting } from "./model.js";

export function findNaturalKeyMatch(
  posting: JobPosting,
  targetByNaturalKey: Map<string, JobPosting>,
  sourceByNaturalKey: Map<string, JobPosting>,
): JobPosting | undefined {
  const key = buildNaturalKey(posting);
  if (sourceByNaturalKey.get(key) !== posting) return undefined;
  return targetByNaturalKey.get(key);
}

export function buildUniqueNaturalKeyMap(postings: JobPosting[]): Map<string, JobPosting> {
  const postingsByKey = new Map<string, JobPosting>();
  const duplicateKeys = new Set<string>();

  for (const posting of postings) {
    const key = buildNaturalKey(posting);
    if (postingsByKey.has(key)) {
      duplicateKeys.add(key);
      postingsByKey.delete(key);
      continue;
    }

    if (!duplicateKeys.has(key)) {
      postingsByKey.set(key, posting);
    }
  }

  return postingsByKey;
}

function buildNaturalKey(posting: JobPosting): string {
  return [posting.source, posting.company, normalizeText(posting.title)].join("|");
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
