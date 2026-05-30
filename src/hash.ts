// 채용 공고의 안정적인 식별자와 변경 감지용 해시를 만든다.
import { createHash } from "node:crypto";
import type { CompanyName, JobPosting, JobSource } from "./model.js";

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function buildContentHash(
  posting: Pick<JobPosting, "company" | "title" | "endDate" | "url">,
): string {
  return hashText([
    posting.company,
    posting.title.trim().replace(/\s+/g, " "),
    posting.endDate ?? "",
    posting.url,
  ].join("|"));
}

export function buildPostingId(source: JobSource, company: CompanyName, title: string, url: string): string {
  return `${source}-${hashText([company, title.trim().replace(/\s+/g, " "), url].join("|"))}`;
}
