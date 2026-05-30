// 채용 공고 변경 결과를 GitHub Pages용 정적 HTML로 렌더링한다.
import type { DiffResult, JobPosting, Snapshot, SourceStatus } from "./model.js";

export function generateHtml(snapshot: Snapshot, diff: DiffResult): string {
  const failedSources = snapshot.sources.filter((source) => !source.ok).length;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>채용 변경 모니터</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f5f7fb; color: #172033; }
    header { background: #172033; color: #ffffff; padding: 28px 24px; }
    main { width: min(1120px, calc(100% - 32px)); margin: 24px auto 48px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 28px; }
    h2 { font-size: 20px; margin: 30px 0 12px; }
    h3 { font-size: 16px; margin: 18px 0 10px; }
    header p { color: #cbd5e1; margin-top: 8px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 20px; }
    .metric { background: rgba(255, 255, 255, .09); border: 1px solid rgba(255, 255, 255, .18); border-radius: 8px; padding: 12px; }
    .metric strong { display: block; font-size: 26px; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .card { background: #ffffff; border: 1px solid #dbe3ef; border-radius: 8px; padding: 14px; box-shadow: 0 1px 2px rgba(15, 23, 42, .06); }
    .card a { color: #075985; font-weight: 700; text-decoration: none; }
    .card a:hover { text-decoration: underline; }
    .badge { display: inline-flex; border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 700; margin-right: 6px; }
    .new { background: #dcfce7; color: #166534; }
    .changed { background: #fef3c7; color: #92400e; }
    .soon { background: #fee2e2; color: #991b1b; }
    .stable { background: #e0f2fe; color: #075985; }
    .failed { background: #fee2e2; color: #991b1b; }
    .meta { color: #596579; font-size: 13px; line-height: 1.55; margin-top: 8px; }
    .empty { color: #596579; background: #ffffff; border: 1px dashed #b8c4d6; border-radius: 8px; padding: 16px; }
  </style>
</head>
<body>
  <header>
    <h1>채용 변경 모니터</h1>
    <p>마지막 체크: ${escapeHtml(snapshot.checkedAt)}</p>
    <div class="summary">
      ${metric("전체", snapshot.postings.length)}
      ${metric("신규", diff.newPostings.length)}
      ${metric("변경", diff.changedPostings.length)}
      ${metric("마감임박", diff.closingSoonPostings.length)}
      ${metric("실패 소스", failedSources)}
    </div>
  </header>
  <main>
    ${section("신규 공고", renderPostingCards(diff.newPostings, "new", "신규"))}
    ${section("변경 공고", renderChangedCards(diff.changedPostings))}
    ${section("마감임박", renderPostingCards(diff.closingSoonPostings, "soon", "마감임박"))}
    ${section("회사별 전체 공고", renderGroupedPostings(snapshot.postings))}
    ${section("사라진 공고", renderPostingCards(diff.removedPostings, "changed", "사라짐"))}
    ${section("Source status", renderSourceStatus(snapshot.sources))}
  </main>
</body>
</html>`;
}

function metric(label: string, value: number): string {
  return `<div class="metric">${escapeHtml(label)}<strong>${value}</strong></div>`;
}

function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body || `<div class="empty">표시할 항목이 없습니다.</div>`}</section>`;
}

function renderPostingCards(postings: JobPosting[], badgeClass: string, badgeLabel: string): string {
  if (postings.length === 0) return "";

  return `<div class="grid">${postings.map((posting) => renderPostingCard(posting, badgeClass, badgeLabel)).join("")}</div>`;
}

function renderChangedCards(changes: DiffResult["changedPostings"]): string {
  if (changes.length === 0) return "";

  return `<div class="grid">${changes.map(({ before, after }) => renderChangedCard(before, after)).join("")}</div>`;
}

function renderChangedCard(before: JobPosting, after: JobPosting): string {
  return `<article class="card">
    ${renderPostingLink(after, "changed", "변경")}
    <div class="meta">
      회사: ${escapeHtml(after.company)}<br>
      마감: ${escapeHtml(after.endDate ?? "-")}<br>
      출처: ${escapeHtml(after.source)}<br>
      이전 제목: ${escapeHtml(before.title)}<br>
      이전 마감: ${escapeHtml(before.endDate ?? "-")}
    </div>
  </article>`;
}

function renderGroupedPostings(postings: JobPosting[]): string {
  if (postings.length === 0) return "";

  const postingsByCompany = new Map<string, JobPosting[]>();
  for (const posting of postings) {
    const companyPostings = postingsByCompany.get(posting.company);
    if (companyPostings) {
      companyPostings.push(posting);
    } else {
      postingsByCompany.set(posting.company, [posting]);
    }
  }

  return Array.from(postingsByCompany.entries())
    .map(
      ([company, companyPostings]) =>
        `<div class="company-group"><h3>${escapeHtml(company)}</h3>${renderPostingCards(companyPostings, "stable", "경력")}</div>`,
    )
    .join("");
}

function renderPostingCard(posting: JobPosting, badgeClass: string, badgeLabel: string): string {
  return `<article class="card">
    ${renderPostingLink(posting, badgeClass, badgeLabel)}
    <div class="meta">
      회사: ${escapeHtml(posting.company)}<br>
      마감: ${escapeHtml(posting.endDate ?? "-")}<br>
      출처: ${escapeHtml(posting.source)}
    </div>
  </article>`;
}

function renderPostingLink(posting: JobPosting, badgeClass: string, badgeLabel: string): string {
  return `<span class="badge ${escapeHtml(badgeClass)}">${escapeHtml(badgeLabel)}</span><a href="${escapeHtml(posting.url)}" target="_blank" rel="noreferrer">${escapeHtml(posting.title)}</a>`;
}

function renderSourceStatus(sources: SourceStatus[]): string {
  if (sources.length === 0) return "";

  return `<div class="grid">${sources.map(renderSourceCard).join("")}</div>`;
}

function renderSourceCard(source: SourceStatus): string {
  const statusClass = source.ok ? "stable" : "failed";
  const statusText = source.ok ? `성공: ${source.postingCount}건` : `실패: ${escapeHtml(source.message)}`;

  return `<article class="card">
    <span class="badge ${statusClass}">${source.ok ? "OK" : "FAIL"}</span>
    <strong>${escapeHtml(source.source)}</strong>
    <div class="meta">${statusText}<br>${escapeHtml(source.checkedAt)}</div>
  </article>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
