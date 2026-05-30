// 이전 스냅샷과 현재 스냅샷을 비교해 화면 표시용 변경 목록을 만든다.
import { daysUntil } from "./date.js";
import type { DiffResult, JobPosting } from "./model.js";

export function diffPostings(
  previous: JobPosting[],
  current: JobPosting[],
  today: string,
  closingSoonDays = 7,
): DiffResult {
  const previousById = new Map(previous.map((posting) => [posting.id, posting]));
  const currentById = new Map(current.map((posting) => [posting.id, posting]));

  const newPostings = current.filter((posting) => !previousById.has(posting.id));

  const changedPostings = current
    .filter((posting) => previousById.has(posting.id))
    .map((posting) => ({ before: previousById.get(posting.id)!, after: posting }))
    .filter(({ before, after }) => before.contentHash !== after.contentHash);

  const closingSoonPostings = current.filter((posting) => {
    if (!posting.endDate) return false;
    const remainingDays = daysUntil(posting.endDate, today);
    return remainingDays >= 0 && remainingDays <= closingSoonDays;
  });

  const removedPostings = previous.filter((posting) => !currentById.has(posting.id));

  return {
    newPostings,
    changedPostings,
    closingSoonPostings,
    removedPostings,
  };
}
