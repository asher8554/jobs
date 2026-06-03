// 채용 공고 변경 결과를 GitHub Pages용 정적 HTML로 렌더링한다.
import type { DiffResult, JobPosting, JobSource, Snapshot, SourceStatus } from "./model.js";

export type SourceLink = {
  source: JobSource;
  url: string;
};

const SOURCE_LABELS: Record<JobSource, string> = {
  samsung: "Samsung",
  hyundai: "Hyundai",
  kia: "Kia",
  mobis: "Mobis",
  lg: "LG",
};

export function generateHtml(snapshot: Snapshot, diff: DiffResult, sourceLinks: SourceLink[] = []): string {
  const failedSources = snapshot.sources.filter((source) => !source.ok).length;
  const preservedSources = snapshot.sources.filter(isPreservedSource).length;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>채용 변경 모니터</title>
  <script>
    (() => {
      const savedTheme = localStorage.getItem("jobs-theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const theme = savedTheme === "dark" || savedTheme === "light" ? savedTheme : prefersDark ? "dark" : "light";
      document.documentElement.dataset.theme = theme;
    })();
  </script>
  <style>
    :root {
      color-scheme: light;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --page-bg: #f5f7fb;
      --text: #172033;
      --muted: #596579;
      --header-bg: #172033;
      --header-text: #ffffff;
      --header-muted: #cbd5e1;
      --surface: #ffffff;
      --surface-border: #dbe3ef;
      --surface-shadow: rgba(15, 23, 42, .06);
      --metric-bg: rgba(255, 255, 255, .09);
      --metric-border: rgba(255, 255, 255, .18);
      --link: #075985;
      --disabled-link: #475569;
      --empty-border: #b8c4d6;
      --toggle-bg: rgba(255, 255, 255, .14);
      --toggle-border: rgba(255, 255, 255, .28);
      --toggle-thumb: #ffffff;
    }
    :root[data-theme="dark"] {
      color-scheme: dark;
      --page-bg: #101114;
      --text: #e7e9ee;
      --muted: #a9b0bd;
      --header-bg: #171a20;
      --header-text: #f8fafc;
      --header-muted: #a9b0bd;
      --surface: #181b22;
      --surface-border: #303640;
      --surface-shadow: rgba(0, 0, 0, .28);
      --metric-bg: rgba(255, 255, 255, .08);
      --metric-border: rgba(255, 255, 255, .16);
      --link: #67e8f9;
      --disabled-link: #c7ccd6;
      --empty-border: #3b4250;
      --toggle-bg: rgba(0, 0, 0, .28);
      --toggle-border: rgba(255, 255, 255, .24);
      --toggle-thumb: #67e8f9;
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) {
        color-scheme: dark;
      }
    }
    body { margin: 0; background: var(--page-bg); color: var(--text); transition: background-color .18s ease, color .18s ease; }
    header { background: var(--header-bg); color: var(--header-text); padding: 28px 24px; }
    main { width: min(1120px, calc(100% - 32px)); margin: 24px auto 48px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 28px; }
    h2 { font-size: 20px; margin: 30px 0 12px; }
    h3 { font-size: 16px; margin: 18px 0 10px; }
    header p { color: var(--header-muted); margin-top: 8px; }
    .header-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 20px; }
    .metric { background: var(--metric-bg); border: 1px solid var(--metric-border); border-radius: 8px; padding: 12px; }
    .metric strong { display: block; font-size: 26px; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .card { background: var(--surface); border: 1px solid var(--surface-border); border-radius: 8px; padding: 14px; box-shadow: 0 1px 2px var(--surface-shadow); }
    .card a { color: var(--link); font-weight: 700; text-decoration: none; }
    .card a:hover { text-decoration: underline; }
    .disabled-link { color: var(--disabled-link); font-weight: 700; }
    .source-links { display: flex; flex-wrap: wrap; gap: 8px; }
    .source-link { align-items: center; background: var(--surface); border: 1px solid var(--surface-border); border-radius: 8px; color: var(--link); display: inline-flex; font-weight: 700; min-height: 40px; padding: 0 12px; text-decoration: none; }
    .source-link:hover { text-decoration: underline; }
    .badge { display: inline-flex; border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 700; margin-right: 6px; }
    .new { background: #dcfce7; color: #166534; }
    .changed { background: #fef3c7; color: #92400e; }
    .soon { background: #fee2e2; color: #991b1b; }
    .stable { background: #e0f2fe; color: #075985; }
    .preserved { background: #fef3c7; color: #92400e; }
    .failed { background: #fee2e2; color: #991b1b; }
    :root[data-theme="dark"] .new { background: #14532d; color: #bbf7d0; }
    :root[data-theme="dark"] .changed { background: #713f12; color: #fde68a; }
    :root[data-theme="dark"] .soon, :root[data-theme="dark"] .failed { background: #7f1d1d; color: #fecaca; }
    :root[data-theme="dark"] .preserved { background: #713f12; color: #fde68a; }
    :root[data-theme="dark"] .stable { background: #164e63; color: #a5f3fc; }
    .meta { color: var(--muted); font-size: 13px; line-height: 1.55; margin-top: 8px; }
    .empty { color: var(--muted); background: var(--surface); border: 1px dashed var(--empty-border); border-radius: 8px; padding: 16px; }
    .theme-switch { align-items: center; color: var(--header-text); cursor: pointer; display: inline-flex; gap: 8px; min-height: 32px; position: relative; white-space: nowrap; }
    .theme-switch input { block-size: 100%; cursor: pointer; inline-size: 100%; inset: 0; margin: 0; opacity: 0; position: absolute; z-index: 1; }
    .theme-slider { background: var(--toggle-bg); border: 1px solid var(--toggle-border); border-radius: 999px; display: inline-flex; height: 28px; padding: 3px; width: 52px; }
    .theme-slider::before { background: var(--toggle-thumb); border-radius: 999px; content: ""; display: block; height: 22px; transform: translateX(0); transition: transform .18s ease; width: 22px; }
    .theme-switch input:checked + .theme-slider::before { transform: translateX(24px); }
    .theme-switch input:focus-visible + .theme-slider { outline: 2px solid #67e8f9; outline-offset: 2px; }
    .theme-label { font-size: 13px; font-weight: 700; }
    @media (max-width: 560px) {
      header { padding: 22px 16px; }
      h1 { font-size: 24px; }
      .header-top { align-items: flex-start; flex-direction: column; }
      .theme-switch { align-self: flex-start; }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-top">
      <div>
        <h1>채용 변경 모니터</h1>
        <p>마지막 체크: ${escapeHtml(snapshot.checkedAt)}</p>
      </div>
      <label class="theme-switch">
        <input id="theme-toggle" type="checkbox" aria-label="다크 모드">
        <span class="theme-slider" aria-hidden="true"></span>
        <span class="theme-label">다크 모드</span>
      </label>
    </div>
    <div class="summary">
      ${metric("전체", snapshot.postings.length)}
      ${metric("신규", diff.newPostings.length)}
      ${metric("변경", diff.changedPostings.length)}
      ${metric("마감임박", diff.closingSoonPostings.length)}
      ${metric("보존 소스", preservedSources)}
      ${metric("실패 소스", failedSources)}
    </div>
  </header>
  <main>
    ${section("채용 사이트 바로가기", renderSourceLinks(sourceLinks))}
    ${section("신규 공고", renderPostingCards(diff.newPostings, "new", "신규"))}
    ${section("변경 공고", renderChangedCards(diff.changedPostings))}
    ${section("마감임박", renderPostingCards(diff.closingSoonPostings, "soon", "마감임박"))}
    ${section("회사별 전체 공고", renderGroupedPostings(snapshot.postings))}
    ${section("사라진 공고", renderPostingCards(diff.removedPostings, "changed", "사라짐"))}
    ${section("Source status", renderSourceStatus(snapshot.sources))}
  </main>
  <script>
    (() => {
      const toggle = document.getElementById("theme-toggle");
      if (!(toggle instanceof HTMLInputElement)) return;

      const applyTheme = (theme) => {
        document.documentElement.dataset.theme = theme;
        toggle.checked = theme === "dark";
      };

      applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

      toggle.addEventListener("change", () => {
        const theme = toggle.checked ? "dark" : "light";
        localStorage.setItem("jobs-theme", theme);
        applyTheme(theme);
      });
    })();
  </script>
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
  const badge = `<span class="badge ${escapeHtml(badgeClass)}">${escapeHtml(badgeLabel)}</span>`;
  const title = escapeHtml(posting.title);

  if (!isHttpUrl(posting.url)) {
    return `${badge}<span class="disabled-link">${title}</span>`;
  }

  return `${badge}<a href="${escapeHtml(posting.url)}" target="_blank" rel="noreferrer">${title}</a>`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function renderSourceLinks(sourceLinks: SourceLink[]): string {
  const links = sourceLinks.filter((link) => isHttpUrl(link.url));
  if (links.length === 0) return "";

  return `<div class="source-links">${links.map(renderSourceLink).join("")}</div>`;
}

function renderSourceLink(link: SourceLink): string {
  return `<a class="source-link" href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(
    SOURCE_LABELS[link.source],
  )}</a>`;
}

function renderSourceStatus(sources: SourceStatus[]): string {
  if (sources.length === 0) return "";

  return `<div class="grid">${sources.map(renderSourceCard).join("")}</div>`;
}

function renderSourceCard(source: SourceStatus): string {
  const status = getSourceDisplayStatus(source);

  return `<article class="card">
    <span class="badge ${status.className}">${status.label}</span>
    <strong>${escapeHtml(source.source)}</strong>
    <div class="meta">${status.text}<br>${escapeHtml(source.checkedAt)}</div>
  </article>`;
}

function getSourceDisplayStatus(source: SourceStatus): { className: string; label: string; text: string } {
  if (isPreservedSource(source)) {
    return {
      className: "preserved",
      label: "보존",
      text: `보존: ${escapeHtml(source.message)}`,
    };
  }

  if (source.ok) {
    return {
      className: "stable",
      label: "OK",
      text: `성공: ${source.postingCount}건`,
    };
  }

  return {
    className: "failed",
    label: "FAIL",
    text: `실패: ${escapeHtml(source.message)}`,
  };
}

function isPreservedSource(source: SourceStatus): source is SourceStatus & { preserved: true; message: string } {
  return "preserved" in source && source.preserved === true;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
