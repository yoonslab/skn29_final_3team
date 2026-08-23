// NotebookLM식 리포트 아티팩트 — 분석 결과를 문서 형태로 정리해 보여준다.
// TOC 앵커 이동, Markdown 내보내기/복사, 추세 차트(Recharts), 인쇄를 제공한다.

import { useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { buildDraftFromRun } from "../../lib/reportBridge.js";

const SECTIONS = [
  ["summary", "요약"],
  ["kpis", "핵심 지표"],
  ["chart", "추세"],
  ["table", "상세 데이터"],
  ["sources", "출처"],
];

export function ReportArtifact({ message, onClose }) {
  const run = message.result;
  const [copiedMd, setCopiedMd] = useState(false);
  const docRef = useRef(null);

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
  const chart = run.chart ?? null;
  const rows = table ? table.rows : [];

  const scrollToSection = (id) => {
    docRef.current?.querySelector(`[data-sec="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toMarkdown = () => {
    const lines = [`# ${draft?.title ?? "운영 분석 리포트"}`, ""];
    lines.push(`> 데이터 기준시각 ${asOf} · 합성 데이터(seed 20260729) 기반 자동 생성`, "", "## 요약", String(run.summary ?? ""));
    if (metrics.length) {
      lines.push("", "## 핵심 지표");
      metrics.forEach((m) => lines.push(`- **${m.label ?? m.metric_id}**: ${m.value}${m.unit ? ` ${m.unit}` : ""}`));
    }
    if (chart && rows.length) {
      lines.push("", `## 추세`, `\`${chart.chartType}\` · x=${chart.xField} · y=${(chart.yFields ?? []).join(", ")}`);
    }
    if (table && table.rows.length) {
      lines.push("", "## 상세 데이터");
      lines.push(`| ${table.columns.join(" | ")} |`);
      lines.push(`|${table.columns.map(() => "---").join("|")}|`);
      table.rows.slice(0, 20).forEach((row) => {
        lines.push(`| ${table.columns.map((c) => String(row[c] ?? "")).join(" | ")} |`);
      });
    }
    if (sources.length) {
      lines.push("", "## 출처");
      sources.forEach((s, i) =>
        lines.push(
          `${i + 1}. ${s.name ?? s.fqn} — \`${s.urn}\`${s.schema_version ? ` (schema ${s.schema_version}, seed ${s.seed_version})` : ""}`,
        ),
      );
    }
    return lines.join("\n");
  };

  const downloadMd = () => {
    const blob = new Blob([toMarkdown()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(draft?.title ?? "answervice-report").replace(/[^\w가-힣-]+/g, "_")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyMd = async () => {
    await navigator.clipboard?.writeText(toMarkdown());
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 1200);
  };

  const saveDraft = () => {
    try {
      sessionStorage.setItem("answervice.report.artifact.savedAt", new Date().toISOString());
      onClose();
      window.history.pushState({}, "", "/reports");
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch {}
  };

  const visibleSections = SECTIONS.filter(([id]) =>
    id === "chart" ? Boolean(chart && rows.length) : id === "table" ? Boolean(table?.rows.length) : true,
  );

  return (
    <aside className="artifact-drawer" aria-label="리포트 아티팩트">
      <div className="artifact-drawer__head">
        <small>REPORT · NOTEBOOK</small>
        <div className="msg-actions">
          <button type="button" onClick={downloadMd}>MD 내보내기</button>
          <button type="button" onClick={copyMd}>{copiedMd ? "복사됨" : "MD 복사"}</button>
          <button type="button" onClick={() => window.print()}>인쇄</button>
          <button type="button" onClick={saveDraft}>초안 저장</button>
          <button type="button" onClick={onClose}>닫기 ✕</button>
        </div>
      </div>

      <nav className="doc-toc" aria-label="문서 목차">
        {visibleSections.map(([id, label]) => (
          <button key={id} onClick={() => scrollToSection(id)}>{label}</button>
        ))}
      </nav>

      <div className="artifact-doc" ref={docRef}>
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

        <section className="doc-section" data-sec="summary">
          <h2>요약</h2>
          <p>{run.summary ?? "요약이 제공되지 않았습니다."}</p>
        </section>

        {metrics.length > 0 && (
          <section className="doc-section" data-sec="kpis">
            <h2>핵심 지표</h2>
            <div className="kpi-row doc-kpis">
              {metrics.map((m, i) => (
                <div className="kpi" key={m.metric_id ?? i}>
                  <small>{m.label ?? m.metric_id}</small>
                  <strong>
                    {typeof m.value === "number" ? m.value.toLocaleString("ko-KR") : String(m.value ?? "")}
                    {m.unit ? ` ${m.unit}` : ""}
                  </strong>
                </div>
              ))}
            </div>
          </section>
        )}

        {chart && rows.length > 0 && (
          <section className="doc-section" data-sec="chart">
            <h2>추세</h2>
            <div className="doc-chart">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -6 }}>
                  <CartesianGrid stroke="#ececea" vertical={false} />
                  <XAxis dataKey={chart.xField} tick={{ fontSize: 11 }} stroke="#8f8d84" />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    stroke="#8f8d84"
                    width={64}
                    tickFormatter={(v) => Number(v).toLocaleString("ko-KR")}
                  />
                  <Tooltip formatter={(v) => Number(v).toLocaleString("ko-KR")} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {(chart.yFields ?? []).map((f, i) => (
                    <Line
                      key={f}
                      type="monotone"
                      dataKey={f}
                      stroke={["#c96442", "#2d5c8a", "#1f7a43"][i % 3]}
                      strokeWidth={2}
                      dot={false}
                      name={f}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {table && table.rows.length > 0 && (
          <section className="doc-section" data-sec="table">
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

        <section className="doc-section doc-sources" data-sec="sources">
          <h2>출처</h2>
          <ol>
            {sources.map((s, i) => (
              <li key={s.urn}>
                <span className="doc-cite">[{i + 1}]</span> {s.name ?? s.fqn} —{" "}
                <code style={{ fontSize: 11 }}>{s.urn}</code>
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
