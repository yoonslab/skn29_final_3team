import { useState } from "react";
import { ChevronDown, FileOutput, Plus } from "lucide-react";
import { buildDraftGrid } from "../../lib/reportBridge.js";

const TONE_LABELS = {
  summary: "요약",
  kpi: "KPI",
  chart: "차트",
  evidence: "근거",
  text: "텍스트",
};

export function ArtifactPanel({
  draft,
  grid,
  collapsed,
  onToggleCollapsed,
  onAddToReport,
  onClearDraft,
  onCreateRun,
  reportRun,
  isPersisting,
}) {
  const [activeBlockId, setActiveBlockId] = useState(() => grid?.[0]?.id ?? null);
  const blocks = Array.isArray(grid) ? grid : buildDraftGrid(draft?.blocks ?? []);
  const title = draft?.title ?? "분석 자동 보고서 초안";
  const blockCount = blocks.length;

  return (
    <aside className={`artifact-panel ${collapsed ? "artifact-panel--collapsed" : ""}`} aria-label="보고서 초안 패널">
      <header className="artifact-panel__head">
        <div>
          <small>REPORT DRAFT</small>
          <h3>{title}</h3>
          <span>{blockCount}개 블록 · 12-컬럼 그리드</span>
        </div>
        <button
          type="button"
          className="artifact-panel__toggle"
          aria-label={collapsed ? "Artifacts 패널 펼치기" : "Artifacts 패널 접기"}
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </header>
      {!collapsed && (
        <>
          <div className="artifact-panel__actions">
            <button
              type="button"
              className="primary"
              onClick={onAddToReport}
              disabled={!draft || blockCount === 0 || isPersisting}
            >
              <Plus size={14} /> 보고서에 담기
            </button>
            <button type="button" className="secondary" onClick={onCreateRun} disabled={!draft || blockCount === 0}>
              <FileOutput size={14} /> 실행 기록 생성
            </button>
            <button type="button" className="secondary" onClick={onClearDraft} disabled={!draft}>
              초기화
            </button>
          </div>
          {reportRun ? (
            <p className="artifact-panel__run" role="status">
              run {reportRun.runId} · {reportRun.status} · v{reportRun.definitionVersion}
            </p>
          ) : null}
          {blocks.length === 0 ? (
            <p className="artifact-panel__empty">분석이 끝나면 결과 카드가 자동으로 초안 후보로 매핑됩니다.</p>
          ) : (
            <div className="artifact-panel__grid" role="list" aria-label="12-컬럼 그리드 미리보기">
              {Array.from({ length: 12 }).map((_, column) => (
                <span key={`col-${column}`} className="artifact-panel__grid-col" aria-hidden="true" />
              ))}
              {blocks.map((block) => {
                const active = block.id === activeBlockId;
                return (
                  <button
                    type="button"
                    key={block.id}
                    role="listitem"
                    aria-pressed={active}
                    className={`artifact-panel__block artifact-panel__block--${block.tone}`}
                    style={{ "--block-x": block.x + 1, "--block-w": block.w, "--block-y": block.y + 1, "--block-h": block.h }}
                    onClick={() => setActiveBlockId(block.id)}
                  >
                    <small>{TONE_LABELS[block.tone] ?? block.tone}</small>
                    <b>{block.title}</b>
                    <span>x{block.x + 1} · w{block.w} · h{block.h}</span>
                    {block.artifactId ? <code>{block.artifactId}</code> : null}
                  </button>
                );
              })}
            </div>
          )}
          {draft?.blocks?.length ? (
            <details className="artifact-panel__serialized">
              <summary>serializeDraftLayout 출력</summary>
              <pre>{JSON.stringify(draft.blocks, null, 2)}</pre>
            </details>
          ) : null}
        </>
      )}
    </aside>
  );
}
