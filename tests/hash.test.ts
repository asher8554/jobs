// 채용 공고 해시 계산 규칙을 검증한다.
import { describe, expect, it } from "vitest";
import { buildContentHash, buildPostingId, hashText } from "../src/hash.js";
import type { JobPosting } from "../src/model.js";

const baseJob: JobPosting = {
  id: "samsung-1",
  company: "Samsung Electronics DX",
  title: "Software Engineer",
  careerType: "career",
  startDate: "2026-05-01",
  endDate: "2026-06-05",
  url: "https://example.com/job/1",
  source: "samsung",
  firstSeenAt: "2026-05-30T00:00:00.000Z",
  lastSeenAt: "2026-05-30T00:00:00.000Z",
  contentHash: "",
};

describe("hash helpers", () => {
  it("returns stable short hashes", () => {
    expect(hashText("same")).toBe(hashText("same"));
    expect(hashText("same")).not.toBe(hashText("other"));
    expect(hashText("same")).toHaveLength(16);
  });

  it("changes content hash when important fields change", () => {
    const original = buildContentHash(baseJob);
    const changed = buildContentHash({ ...baseJob, endDate: "2026-06-10" });

    expect(changed).not.toBe(original);
  });

  it("ignores firstSeenAt and lastSeenAt in content hash", () => {
    const original = buildContentHash(baseJob);
    const changedJob: JobPosting = {
      ...baseJob,
      firstSeenAt: "2026-06-01T00:00:00.000Z",
      lastSeenAt: "2026-06-01T00:00:00.000Z",
    };
    const changed = buildContentHash(changedJob);

    expect(changed).toBe(original);
  });

  it("builds posting ids with the source prefix", () => {
    const id = buildPostingId("kia", "Kia", "Software Engineer", "https://example.com/job/1");

    expect(id.startsWith("kia-")).toBe(true);
  });

  it("normalizes title whitespace when building posting ids", () => {
    const original = buildPostingId("kia", "Kia", "Software Engineer", "https://example.com/job/1");
    const changedWhitespace = buildPostingId(
      "kia",
      "Kia",
      "  Software\n\tEngineer  ",
      "https://example.com/job/1",
    );

    expect(changedWhitespace).toBe(original);
  });

  it("changes posting id when source, company, or url changes", () => {
    const original = buildPostingId("kia", "Kia", "Software Engineer", "https://example.com/job/1");

    expect(buildPostingId("hyundai", "Kia", "Software Engineer", "https://example.com/job/1")).not.toBe(original);
    expect(buildPostingId("kia", "Hyundai Motor Company", "Software Engineer", "https://example.com/job/1")).not.toBe(
      original,
    );
    expect(buildPostingId("kia", "Kia", "Software Engineer", "https://example.com/job/2")).not.toBe(original);
  });
});
