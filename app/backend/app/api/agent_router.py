from __future__ import annotations

import json
import time
from typing import Annotated, Iterator

from fastapi import APIRouter, Body, Depends
from fastapi.responses import StreamingResponse

from app.api.router import controller
from app.context import analysis_context
from app.contracts import (
    AnalysisRequest,
    AnalysisResponse,
    AnalysisStatus,
    PipelineStage,
    RequestContext,
)

agent_router = APIRouter(prefix="/api/v1", include_in_schema=False)

_STEP_LABELS = {
    1: "질문 이해",
    2: "컨텍스트 검증",
    3: "SQL 생성",
    4: "SQL 안전성 검증",
    5: "조회 실행",
    6: "결과 검증",
    7: "설명 생성",
}

_STAGE_TO_STEP = {
    PipelineStage.ROUTER: 1,
    PipelineStage.CONTROLLER: 1,
    PipelineStage.CONTEXT: 2,
    PipelineStage.CONTEXT_VALIDATION: 2,
    PipelineStage.MODEL: 3,
    PipelineStage.REPAIR: 3,
    PipelineStage.SQL_VALIDATION: 4,
    PipelineStage.QUERY: 5,
    PipelineStage.RESULT_VERIFICATION: 6,
    PipelineStage.ARTIFACT: 7,
}


def _sse(event: str, data: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _trace_event(step: int, status: str, meta: str | None = None) -> str:
    return _sse(
        "trace",
        {"step": step, "label": _STEP_LABELS[step], "status": status, "meta": meta},
    )


def _terminal_step(response: AnalysisResponse) -> tuple[int, str]:
    status = response.data.status
    if status in (AnalysisStatus.SUCCEEDED, AnalysisStatus.PARTIAL):
        return 7, "done"
    trace = response.data.trace
    stage = trace[-1].stage if trace else PipelineStage.ROUTER
    step = _STAGE_TO_STEP.get(stage, 1)
    sse_status = "blocked" if status == AnalysisStatus.BLOCKED else "failed"
    return step, sse_status


def _result_event(response: AnalysisResponse) -> str:
    result = response.data.result
    artifact = response.data.artifact
    artifact_id = (
        str(artifact.artifact_id)
        if artifact is not None
        else (str(result.evidence.artifact_id) if result and result.evidence.artifact_id else None)
    )
    if result is None:
        return _sse("result", {"artifact_id": artifact_id})
    return _sse(
        "result",
        {
            "artifact_id": artifact_id,
            "metrics": [metric.model_dump(mode="json") for metric in result.metrics],
            "table": result.table.model_dump(mode="json") if result.table else None,
            "chart": result.chart.model_dump(mode="json") if result.chart else None,
            "evidence": result.evidence.model_dump(mode="json"),
        },
    )


def _stream(payload: AnalysisRequest, context: RequestContext) -> Iterator[str]:
    started = time.monotonic()
    try:
        response = controller.submit(payload, context)
    except Exception:  # noqa: BLE001 - SSE는 안전한 오류 이벤트로 닫는다.
        duration_ms = int((time.monotonic() - started) * 1000)
        yield _trace_event(1, "failed")
        yield _sse(
            "error",
            {"code": "INTERNAL_ERROR", "message": "분석 요청을 처리할 수 없습니다."},
        )
        yield _sse("done", {"trace_id": context.trace_id, "duration_ms": duration_ms})
        return

    terminal_step, terminal_status = _terminal_step(response)
    for step in range(1, terminal_step + 1):
        status = terminal_status if step == terminal_step else "done"
        yield _trace_event(step, status)

    if response.error is not None:
        yield _sse(
            "error",
            {
                "code": response.error.code.value,
                "message": response.error.message,
            },
        )
    else:
        yield _result_event(response)

    duration_ms = int((time.monotonic() - started) * 1000)
    yield _sse("done", {"trace_id": context.trace_id, "duration_ms": duration_ms})


@agent_router.post("/agent/analyze/stream")
def analyze_stream(
    payload: Annotated[AnalysisRequest, Body()],
    context: Annotated[RequestContext, Depends(analysis_context)],
) -> StreamingResponse:
    return StreamingResponse(
        _stream(payload, context),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
