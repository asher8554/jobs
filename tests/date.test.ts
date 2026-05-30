// 채용 공고 날짜 파싱과 마감 임박 계산을 검증한다.
import { describe, expect, it } from "vitest";
import { daysUntil, extractDateRange, kstDateStamp } from "../src/date.js";

describe("date helpers", () => {
  it("extracts Korean dot date ranges", () => {
    expect(extractDateRange("2026.05.01 ~ 2026.06.05")).toEqual({
      startDate: "2026-05-01",
      endDate: "2026-06-05",
    });
  });

  it("extracts single deadline as endDate", () => {
    expect(extractDateRange("접수기간 2026-06-05까지")).toEqual({
      startDate: null,
      endDate: "2026-06-05",
    });
  });

  it("calculates days until deadline using UTC date parts", () => {
    expect(daysUntil("2026-06-06", "2026-05-30")).toBe(7);
  });

  it("formats KST date stamp", () => {
    expect(kstDateStamp(new Date("2026-05-30T00:30:00.000Z"))).toBe("2026-05-30");
  });
});
