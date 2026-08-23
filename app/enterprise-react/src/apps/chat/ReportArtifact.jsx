// NotebookLM식 리포트 아티팩트 — 분석 결과를 문서 형태로 정리해 보여준다.

import { useMemo } from "react";
import { buildDraftFromRun } from "../../lib/reportBridge.js";

export function ReportArtifact({ message, onClose }) {
  const run = message.result;
  const draft = useMemo(() => {
    try {
      return buildDraftFromRun(run);
    } catch {
      return null;
    }
  }, [run]);

  const sources = Array.isArray(run.evidence?.sources) ? run.evidence.sources : [];
  const asOf = run.evidence?.as_of ?? "—";
  const metrics = Array.isArray(run.metrics) ? run.metrics : [];
  const table = run.table && Array.isArray(run.table.rows) ? run.table : null;

  const saveDraft = () => {
    try {
      sessionStorage.setItem(
        "answervice.report.artifact",
        JSON.stringify({ artifactId: run.artifact?.artifact_id, blocks: draft?.blocks ?? [], savedAt: new Date().toISOString() }),
      );
      onClose();
      window.history.pushState({}, "", "/reports");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {}
  };

  return (
    <aside className="artifact-drawer" aria-label="리포트 아티팩트">
      <div className="artifact-drawer__head">
        <small>REPORT · NOTEBOOK</small>
        <div className="msg-actions">
          <button type="button" onClick={saveDraft}>보고서 초안 저장</button>
          <button type="button" onClick={onClose}>닫기 ✕</button>
        </div>
      </div>

      <div className="artifact-doc">
        <h1 className="doc-title">{draft?.title ?? "운영 분석 리포트"}</h1>
        <p className="doc-sub">데이터 기준시각 {asOf} · 합성 데이터(seed 20260729) 기반 자동 생성</p>

        <div className="doc-source-chips">
          {sources.slice(0, 4).map((s) => (
            <span className="chip-agent" key={s.urn} title={s.urn}>
              <span className="agent-dot" style={{ "--agent-hue": 210 }} />
              {s.name ?? s.fqn}
            </span>
          ))}
        </div>

        <section className="doc-section">
          <h2>요약</h2>
          <p>{run.summary ?? "요약이 제공되지 않았습니다."}</p>
        </section>

        {metrics.length > 0 && (
          <section className="doc-section">
            <h2>핵심 지표</h2>
            <div className="kpi-row" style={{ border: "1px solid var(--c-line)", borderRadius: 12 }}>
              {metrics.map((m, i) => (
                <div className="kpi" key={m.metric_id ?? i}>
                  <small>{m.label ?? m.metric_id}</small>
                  <strong>{typeof m.value === "number" ? m.value.toLocaleString("ko-KR") : String(m.value ?? "")}{m.unit ? ` ${m.unit}` : ""}</strong>
                </div>
              ))}
            </div>
          </section>
        )}

        {table && table.rows.length > 0 && (
          <section className="doc-section">
            <h2>상세 데이터</h2>
            <table className="data-table">
              <thead><tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i}>{table.columns.map((c) => <td key={c}>{String(row[c] ?? "")}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="doc-section doc-sources">
          <h2>출처</h2>
          <ol>
            {sources.map((s, i) => (
              <li key={s.urn}>
                <span className="doc-cite">[{i + 1}]</span> {s.name ?? s.fqn} — <code style={{ fontSize: 11 }}>{s.urn}</code>
                {s.schema_version ? ` · schema ${s.schema_version}` : ""}
                {s.seed_version ? ` · seed ${s.seed_version}` : ""}
              </li>
            ))}
            {sources.length === 0 && <li>출처 정보가 제공되지 않았습니다.</li>}
          </ol>
        </section>
      </div>
    </aside>
  );
}

function PlusIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
