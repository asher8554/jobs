// 이전 스냅샷과 현재 스냅샷을 비교해 화면 표시용 변경 목록을 만든다.
import { daysUntil } from "./date.js";
import type { DiffResult, JobPosting } from "./model.js";
import { buildUniqueNaturalKeyMap, findNaturalKeyMatch } from "./posting-key.js";

function buildPostingMap(postings: JobPosting[]): Map<string, JobPosting> {
  const postingsById = new Map<string, JobPosting>();

  for (const posting of postings) {
    if (postingsById.has(posting.id)) {
      throw new Error(`Duplicate job id: ${posting.id}`);
    }
    postingsById.set(posting.id, posting);
  }

  return postingsById;
}

export function diffPostings(
  previous: JobPosting[],
  current: JobPosting[],
  today: string,
  closingSoonDays = 7,
): DiffResult {
  const previousById = buildPostingMap(previous);
  const currentById = buildPostingMap(current);
  const previousByNaturalKey = buildUniqueNaturalKeyMap(previous);
  const currentByNaturalKey = buildUniqueNaturalKeyMap(current);

  const newPostings = current.filter(
    (posting) => !findPreviousPosting(posting, previousById, previousByNaturalKey, currentByNaturalKey),
  );

  const changedPostings = current
    .map((posting) => ({
      before: findPreviousPosting(posting, previousById, previousByNaturalKey, currentByNaturalKey),
      after: posting,
    }))
    .filter((match): match is { before: JobPosting; after: JobPosting } => match.before !== undefined)
    .filter(({ before, after }) => hasPostingChanged(before, after));

  const closingSoonPostings = current.filter((posting) => {
    if (!posting.endDate) return false;
    const remainingDays = daysUntil(posting.endDate, today);
    return remainingDays >= 0 && remainingDays <= closingSoonDays;
  });

  const removedPostings = previous.filter(
    (posting) => !findCurrentPosting(posting, currentById, previousByNaturalKey, currentByNaturalKey),
  );

  return {
    newPostings,
    changedPostings,
    closingSoonPostings,
    removedPostings,
  };
}

function findPreviousPosting(
  posting: JobPosting,
  previousById: Map<string, JobPosting>,
  previousByNaturalKey: Map<string, JobPosting>,
  currentByNaturalKey: Map<string, JobPosting>,
): JobPosting | undefined {
  return previousById.get(posting.id) ?? findNaturalKeyMatch(posting, previousByNaturalKey, currentByNaturalKey);
}

function findCurrentPosting(
  posting: JobPosting,
  currentById: Map<string, JobPosting>,
  previousByNaturalKey: Map<string, JobPosting>,
  currentByNaturalKey: Map<string, JobPosting>,
): JobPosting | undefined {
  return currentById.get(posting.id) ?? findNaturalKeyMatch(posting, currentByNaturalKey, previousByNaturalKey);
}

function hasPostingChanged(before: JobPosting, after: JobPosting): boolean {
  return (
    before.source !== after.source ||
    before.company !== after.company ||
    before.careerType !== after.careerType ||
    before.title !== after.title ||
    before.startDate !== after.startDate ||
    before.endDate !== after.endDate ||
    before.url !== after.url
  );
}
