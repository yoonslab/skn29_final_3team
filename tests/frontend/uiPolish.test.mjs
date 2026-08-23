import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { formatRelativeTime, RELATIVE_TIME_LABELS } from "../../app/enterprise-react/src/lib/relativeTime.js";

const NOW_ISO = "2026-08-23T12:00:00.000Z";

function minutesAgo(minutes) {
  return new Date(Date.parse(NOW_ISO) - minutes * 60_000).toISOString();
}

function hoursAgo(hours) {
  return new Date(Date.parse(NOW_ISO) - hours * 3_600_000).toISOString();
}

function daysAgo(days) {
  return new Date(Date.parse(NOW_ISO) - days * 86_400_000).toISOString();
}

test("formatRelativeTime: same instant returns 방금 전", () => {
  assert.equal(formatRelativeTime(NOW_ISO, NOW_ISO), "방금 전");
});

test("formatRelativeTime: gap under one minute returns 방금 전", () => {
  // 20s ago, 59s ago — both below the 1-minute boundary.
  const twentySecAgo = new Date(Date.parse(NOW_ISO) - 20_000).toISOString();
  const fiftyNineSecAgo = new Date(Date.parse(NOW_ISO) - 59_000).toISOString();
  assert.equal(formatRelativeTime(NOW_ISO, twentySecAgo), "방금 전");
  assert.equal(formatRelativeTime(NOW_ISO, fiftyNineSecAgo), "방금 전");
});

test("formatRelativeTime: minute boundaries use N분 전 without rounding up", () => {
  assert.equal(formatRelativeTime(NOW_ISO, minutesAgo(1)), "1분 전");
  assert.equal(formatRelativeTime(NOW_ISO, minutesAgo(3)), "3분 전");
  assert.equal(formatRelativeTime(NOW_ISO, minutesAgo(59)), "59분 전");
});

test("formatRelativeTime: hour boundaries use N시간 전", () => {
  assert.equal(formatRelativeTime(NOW_ISO, hoursAgo(1)), "1시간 전");
  assert.equal(formatRelativeTime(NOW_ISO, hoursAgo(5)), "5시간 전");
  assert.equal(formatRelativeTime(NOW_ISO, hoursAgo(23)), "23시간 전");
});

test("formatRelativeTime: day boundaries under 7 days use N일 전", () => {
  assert.equal(formatRelativeTime(NOW_ISO, daysAgo(1)), "1일 전");
  assert.equal(formatRelativeTime(NOW_ISO, daysAgo(3)), "3일 전");
  assert.equal(formatRelativeTime(NOW_ISO, daysAgo(6)), "6일 전");
});

test("formatRelativeTime: gap of 7 days or more falls back to YYYY-MM-DD (UTC)", () => {
  // 7 days exactly should be date fallback (the < 7 * DAY_MS branch is exclusive).
  assert.equal(formatRelativeTime(NOW_ISO, daysAgo(7)), "2026-08-16");
  assert.equal(formatRelativeTime(NOW_ISO, daysAgo(30)), "2026-07-24");
  assert.equal(formatRelativeTime(NOW_ISO, daysAgo(365)), "2025-08-23");
});

test("formatRelativeTime: future timestamps clamp to 방금 전", () => {
  const inFuture = new Date(Date.parse(NOW_ISO) + 3_600_000).toISOString();
  assert.equal(formatRelativeTime(NOW_ISO, inFuture), "방금 전");
});

test("formatRelativeTime: accepts Date, ISO string, and millisecond number inputs symmetrically", () => {
  const nowDate = new Date(NOW_ISO);
  const pastDate = new Date(minutesAgo(15));
  const pastMs = Date.parse(minutesAgo(15));

  assert.equal(formatRelativeTime(nowDate, pastDate), "15분 전");
  assert.equal(formatRelativeTime(NOW_ISO, pastMs), "15분 전");
  assert.equal(formatRelativeTime(nowDate.getTime(), minutesAgo(15)), "15분 전");
});

test("formatRelativeTime: is deterministic across repeated calls with the same inputs", () => {
  const samples = [
    [NOW_ISO, minutesAgo(2)],
    [NOW_ISO, minutesAgo(45)],
    [NOW_ISO, hoursAgo(2)],
    [NOW_ISO, daysAgo(4)],
    [NOW_ISO, daysAgo(10)],
  ];
  for (const [now, past] of samples) {
    const first = formatRelativeTime(now, past);
    const second = formatRelativeTime(now, past);
    const third = formatRelativeTime(now, past);
    assert.equal(first, second);
    assert.equal(second, third);
  }
});

test("formatRelativeTime: rejects malformed inputs instead of silently returning a wrong label", () => {
  assert.throws(() => formatRelativeTime(NOW_ISO, "not-a-date"), /pastIso/);
  assert.throws(() => formatRelativeTime("not-a-date", NOW_ISO), /nowIso/);
  assert.throws(() => formatRelativeTime(NOW_ISO, Number.NaN), /pastIso/);
  assert.throws(() => formatRelativeTime(undefined, NOW_ISO), /nowIso/);
});

test("RELATIVE_TIME_LABELS exposes the just-now constant for callers that need it", () => {
  assert.equal(RELATIVE_TIME_LABELS.JUST_NOW, "방금 전");
});

// -----------------------------------------------------------------
// UI polish contract greps: confirm ReportsPage / styles.css strings
// the existing contracts.test.mjs relies on are still present after
// the polish pass.
// -----------------------------------------------------------------

const reportsPageSource = readFileSync(
  new URL("../../app/enterprise-react/src/pages/ReportsPage.jsx", import.meta.url),
  "utf8",
);
const stylesCssSource = readFileSync(
  new URL("../../app/enterprise-react/src/styles.css", import.meta.url),
  "utf8",
);
const catalogPageSource = readFileSync(
  new URL("../../app/enterprise-react/src/pages/CatalogPage.jsx", import.meta.url),
  "utf8",
);
const appHeaderSource = readFileSync(
  new URL("../../app/enterprise-react/src/components/layout/AppHeader.jsx", import.meta.url),
  "utf8",
);
const appSidebarSource = readFileSync(
  new URL("../../app/enterprise-react/src/components/layout/AppSidebar.jsx", import.meta.url),
  "utf8",
);
const indexHtmlSource = readFileSync(
  new URL("../../app/enterprise-react/index.html", import.meta.url),
  "utf8",
);

test("ReportsPage still exposes the run-history fixture strings the contract test relies on", () => {
  assert.match(reportsPageSource, /LOCAL SYNTHETIC FIXTURE/);
  assert.match(reportsPageSource, /Run History 상태·접근성 점검/);
  assert.match(reportsPageSource, /성공·부분 성공·실패 블록/);
  assert.match(reportsPageSource, /aria-live="polite"/);
  assert.match(reportsPageSource, /aria-pressed=\{selectedRunId === run\.id\}/);
  assert.match(reportsPageSource, /detailRef\.current\?\.focus\(\)/);
  assert.match(reportsPageSource, /REPORT_ADMIN 권한이 없는 사용자/);
  assert.match(reportsPageSource, /로컬 실행 이력을 불러오는 중/);
  assert.match(reportsPageSource, /표시할 실행 이력이 없습니다/);
  assert.match(reportsPageSource, /실행 이력을 불러오지 못했습니다/);
  assert.match(reportsPageSource, /aria-label={`\$\{block\.title} 앞으로 이동`}/);
  assert.match(reportsPageSource, /aria-label={`\$\{block\.title} 너비 늘리기`}/);
  assert.match(reportsPageSource, /aria-label={`\$\{block\.title} 높이 늘리기`}/);
  assert.match(reportsPageSource, /aria-label={`\$\{block\.title} 삭제`}/);
  for (const status of ["queued", "running", "success", "partial", "failed", "cancelled"]) {
    assert.match(reportsPageSource, new RegExp(`status: "${status}"`));
  }
  // Regression: the polish pass must not re-introduce forbidden handlers.
  assert.doesNotMatch(reportsPageSource, /onClick=\{finalizeReport\}/);
  assert.doesNotMatch(reportsPageSource, /공유 링크를 생성했습니다/);
});

test("ReportsPage polish: latest run uses relative-time formatter and CTA is gated by sessionStorage", () => {
  assert.match(reportsPageSource, /formatRelativeTime/);
  assert.match(reportsPageSource, /answervice\.report\.artifact/);
  assert.match(reportsPageSource, /분석 결과를 먼저 보고서에 담아주세요/);
});

test("CatalogPage polish: empty state message and reset button are present", () => {
  assert.match(catalogPageSource, /조건에 맞는 데이터 원천이 없습니다/);
  // The reset button must reset BOTH filters back to empty defaults.
  assert.match(catalogPageSource, /필터 초기화|초기화/);
});

test("CatalogPage polish: Esc handler closes the drawer", () => {
  assert.match(catalogPageSource, /Escape/);
  assert.match(catalogPageSource, /focus\(\)/);
});

test("AppHeader polish: SYNTHETIC DEMO outline pill is rendered on the right", () => {
  assert.match(appHeaderSource, /SYNTHETIC DEMO/);
  // The old dummy "5개 논리 소스" literal must be gone so the header is clean.
  assert.doesNotMatch(appHeaderSource, /5개 논리 소스/);
});

test("AppSidebar polish: nav order, aria-current, uppercase group labels", () => {
  // Order: chat → reports → catalog.
  const chatIdx = appSidebarSource.indexOf('id: "chat"');
  const reportsIdx = appSidebarSource.indexOf('id: "reports"');
  const catalogIdx = appSidebarSource.indexOf('id: "catalog"');
  assert.ok(chatIdx > -1 && reportsIdx > -1 && catalogIdx > -1, "nav ids present");
  assert.ok(chatIdx < reportsIdx, "chat must come before reports");
  assert.ok(reportsIdx < catalogIdx, "reports must come before catalog");
  // aria-current attribute on the active button.
  assert.match(
    appSidebarSource,
    /aria-current=\{[^}]*"page"[^}]*\}/,
  );
  // Uppercase group labels as requested.
  assert.match(appSidebarSource, /WORKSPACE/);
  assert.match(appSidebarSource, /DATA/);
});

test("styles.css polish regression: grid + media queries the contract test pins are untouched", () => {
  assert.match(stylesCssSource, /grid-template-columns:repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(stylesCssSource, /grid-column:var\(--block-x\)\/span var\(--block-w\)/);
  assert.match(stylesCssSource, /grid-row:var\(--block-y\)\/span var\(--block-h\)/);
  assert.match(stylesCssSource, /button:focus-visible/);
  assert.match(stylesCssSource, /@media\(max-width:900px\)/);
  assert.match(stylesCssSource, /@media\(max-width:650px\).*\.editor-block\{grid-column:1\/-1;grid-row:auto/s);
  assert.match(stylesCssSource, /\.report-run-fixture button:focus-visible/);
  assert.match(stylesCssSource, /@media\(max-width:480px\).*\.report-run-list,\.report-view-states\{grid-template-columns:1fr\}/s);
});

test("index.html polish: meta description matches the requested copy", () => {
  assert.match(
    indexHtmlSource,
    /<meta\s+name="description"\s+content="ANSWERVICE — 대화형 데이터 분석과 자동 리포팅"\s*\/?>/,
  );
  // Favicon link is only present when a public asset exists; this repo ships none.
  if (existsSync(new URL("../../app/enterprise-react/public/favicon.svg", import.meta.url))
    || existsSync(new URL("../../app/enterprise-react/public/favicon.ico", import.meta.url))) {
    assert.match(indexHtmlSource, /rel="icon"/);
  } else {
    assert.doesNotMatch(indexHtmlSource, /rel="icon"/);
  }
});
