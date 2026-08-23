// SourceCard — clickable card exposing aria-expanded and key metadata.
// The metric list lives in the drawer; this card shows the count.

import { engineBadgeTone } from "../../lib/catalogView.js";

function statusTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "active" || value === "config_validated") return "is-active";
  if (value === "delayed" || value === "degraded") return "is-delayed";
  if (value === "error" || value === "blocked" || value === "failed") return "is-error";
  return "is-muted";
}

function statusLabel(status) {
  const value = String(status || "").toLowerCase();
  if (value === "active" || value === "config_validated") return "active";
  if (value === "delayed") return "delayed";
  if (value === "degraded") return "degraded";
  if (value === "error" || value === "blocked" || value === "failed") return "error";
  return value || "unknown";
}

export function SourceCard({ source, expanded, onToggle, buttonRef }) {
  const tone = engineBadgeTone(source.engine);
  const statusClass = statusTone(source.status);
  const metricCount = Array.isArray(source.metric_ids) ? source.metric_ids.length : 0;
  const labelId = `dh-card-${source.urn}-label`;
  return (
    <button
      ref={buttonRef}
      type="button"
      className="dh-card"
      aria-expanded={expanded}
      aria-controls={`dh-drawer-${source.urn}`}
      aria-labelledby={labelId}
      onClick={() => onToggle(source.urn)}
    >
      <div className="dh-card__top">
        <span className={`dh-engine-badge ${tone}`}>
          <i aria-hidden="true" />
          {source.engine}
        </span>
        <span className={`dh-status-pill ${statusClass}`} title={`status: ${source.status}`}>
          <i aria-hidden="true" />
          {statusLabel(source.status)}
        </span>
      </div>
      <p className="dh-card__urn" id={labelId} title={source.urn}>
        {source.urn}
      </p>
      <p className="dh-card__fqn" title={source.fqn}>{source.fqn}</p>
      <div className="dh-card__row">
        <p className="dh-card__owner">owner · {source.owner}</p>
      </div>
      <div className="dh-card__metrics">
        <b>{metricCount}</b>
        <span>승인 지표</span>
      </div>
    </button>
  );
}
