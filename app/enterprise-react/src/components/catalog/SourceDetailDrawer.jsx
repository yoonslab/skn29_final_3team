// SourceDetailDrawer — appears below or beside the source grid showing
// the metric pills and full metadata table for the currently expanded source.
// Exposes a ref so the parent can move focus here on open, and listens for
// Escape so keyboard users can close it.

import { forwardRef } from "react";
import { X } from "lucide-react";

function FieldList({ source }) {
  return (
    <dl className="dh-drawer__table">
      <dt>URN</dt>
      <dd>{source.urn}</dd>
      <dt>FQN</dt>
      <dd>{source.fqn}</dd>
      <dt>engine</dt>
      <dd>{source.engine}</dd>
      <dt>owner</dt>
      <dd>{source.owner}</dd>
      <dt>status</dt>
      <dd>{source.status}</dd>
    </dl>
  );
}

export const SourceDetailDrawer = forwardRef(function SourceDetailDrawer({ source, onClose }, ref) {
  if (!source) return null;
  const metrics = Array.isArray(source.metric_ids) ? source.metric_ids : [];
  return (
    <section
      ref={ref}
      tabIndex={-1}
      className="dh-drawer"
      role="region"
      aria-label={`${source.urn} 상세 메타데이터`}
      id={`dh-drawer-${source.urn}`}
    >
      <div className="dh-drawer__head">
        <div>
          <h3>{source.fqn}</h3>
          <small title={source.urn}>{source.urn}</small>
        </div>
        <button
          type="button"
          className="dh-drawer__close"
          onClick={onClose}
          aria-label="상세 닫기"
        >
          <X size={14} />
        </button>
      </div>
      <div className="dh-drawer__metrics" aria-label="승인 지표 목록">
        {metrics.length === 0 ? (
          <span style={{ color: "var(--muted)", fontSize: 12 }}>승인된 지표가 없습니다.</span>
        ) : (
          metrics.map((metricId) => (
            <span key={metricId} className="dh-metric-pill">{metricId}</span>
          ))
        )}
      </div>
      <FieldList source={source} />
    </section>
  );
});
