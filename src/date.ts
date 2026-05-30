// 채용 공고의 날짜 문자열을 표준 날짜로 정규화한다.
export type DateRange = {
  startDate: string | null;
  endDate: string | null;
};

const OPEN_ENDED_MARKER_PATTERN = /채용\s*시\s*까지|상시채용|상시/;

export function normalizeDateText(value: string): string | null {
  const match = value.match(/(20\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function extractDateRange(text: string): DateRange {
  const matches = [...text.matchAll(/20\d{2}[.\-/년\s]+\d{1,2}[.\-/월\s]+\d{1,2}/g)]
    .map((match) => normalizeDateText(match[0]))
    .filter((date): date is string => date !== null);

  if (matches.length >= 2) {
    return { startDate: matches[0], endDate: matches[matches.length - 1] };
  }

  if (matches.length === 1) {
    if (OPEN_ENDED_MARKER_PATTERN.test(text)) {
      return { startDate: matches[0], endDate: null };
    }

    return { startDate: null, endDate: matches[0] };
  }

  return { startDate: null, endDate: null };
}

export function daysUntil(endDate: string, today: string): number {
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const endTime = Date.UTC(endYear, endMonth - 1, endDay);
  const todayTime = Date.UTC(todayYear, todayMonth - 1, todayDay);
  return Math.ceil((endTime - todayTime) / 86_400_000);
}

export function kstDateStamp(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(date);
}
