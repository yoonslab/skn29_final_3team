import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { resolveViewState } from "../../contracts/analysis.ts";
import { presentViewState } from "../../lib/reportBridge.js";

function formatNumber(value) {
  return typeof value === "number" ? value.toLocaleString("ko-KR") : String(value ?? "—");
}

function formatValue(value) {
  return typeof value === "number" ? value.toLocaleString("ko-KR") : String(value ?? "—");
}

export function ResultCard({ run }) {
  if (!run) return null;
  const viewState = resolveViewState(run);
  const presentation = presentViewState(viewState);
  const showResult = viewState === "READY" || viewState === "PARTIAL";
  const chart = showResult ? run.chart : null;
  const table = showResult ? run.table : null;
  const metrics = Array.isArray(run.metrics) ? run.metrics : [];
  const evidence = run.evidence;
  const sourceRows = Array.isArray(run.sources) ? run.sources : [];

  return (
    <section className={`result-card result-card--${viewState.toLowerCase()}`} aria-live="polite">
      <header>
        <div>
          <small>결과 카드</small>
          <h3>{presentation.label}</h3>
        </div>
        <span className={`result-card__tone result-card__tone--${presentation.tone}`}>{presentation.tone}</span>
      </header>
      {run.error ? (
        <p className="result-card__error">{run.error.message} <code>{run.error.code}</code></p>
      ) : null}
      {showResult && run.summary ? <p className="result-card__summary">{run.summary}</p> : null}
      {showResult && metrics.length ? (
        <div className="result-card__kpis" aria-label="KPI 행">
          {metrics.map((metric) => (
            <article key={metric.metricId}>
              <small>{metric.label}</small>
              <strong>{formatNumber(metric.value)} {metric.unit ?? ""}</strong>
              <code>{metric.metricId}</code>
            </article>
          ))}
        </div>
      ) : null}
      {chart && table?.rows.length ? (
        <div className="result-card__chart" aria-label={`${chart.chartType} 차트`}>
          <small>{chart.chartType} · x={chart.xField} · y={chart.yFields.join(", ")}</small>
          <ResponsiveContainer width="100%" height={210}>
            <LineChart data={table.rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={chart.xField} />
              <YAxis />
              <Tooltip />
              {chart.yFields.map((field) => (
                <Line key={field} dataKey={field} name={field} type="monotone" stroke="#9d7b45" />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      {table?.columns.length ? (
        <div className="result-card__table">
          <table>
            <thead>
              <tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr key={`${run.requestId}-${index}`}>
                  {table.columns.map((column) => <td key={column}>{formatValue(row[column])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {evidence ? (
        <details className="result-card__evidence" open>
          <summary>분석 근거</summary>
          <dl>
            <div><dt>as_of</dt><dd>{evidence.asOf}</dd></div>
            <div><dt>period</dt><dd>{evidence.period ? `${evidence.period.start} ~ ${evidence.period.endExclusive}` : "—"}</dd></div>
            <div><dt>filter</dt><dd>{Object.entries(evidence.filters ?? {}).map(([k, v]) => `${k}=${String(v)}`).join(", ") || "없음"}</dd></div>
            <div><dt>sampling</dt><dd>{evidence.sampling.applied ? "적용" : "미적용"} · {evidence.sampling.returnedRows}/{evidence.sampling.totalRows ?? "unknown"}</dd></div>
          </dl>
          <ul className="result-card__sources">
            {sourceRows.map((source) => (
              <li key={source.urn}>
                <b>{source.name}</b>
                <span>{source.status === "success" ? "정상" : "실패"}</span>
                <code>{source.urn}</code>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
