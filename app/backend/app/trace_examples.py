from app.contracts import PipelineStage, StageOutcome, TraceStep


def fixture_trace(name: str) -> tuple[TraceStep, ...]:
    stages = {
        "g1_clarification": (
            PipelineStage.ROUTER,
            PipelineStage.CONTROLLER,
            PipelineStage.CONTEXT,
            PipelineStage.CONTEXT_VALIDATION,
        ),
        "g2_blocked": (
            PipelineStage.ROUTER,
            PipelineStage.CONTROLLER,
            PipelineStage.CONTEXT,
            PipelineStage.CONTEXT_VALIDATION,
            PipelineStage.MODEL,
            PipelineStage.SQL_VALIDATION,
        ),
        "timeout": (
            PipelineStage.ROUTER,
            PipelineStage.CONTROLLER,
            PipelineStage.CONTEXT,
            PipelineStage.CONTEXT_VALIDATION,
            PipelineStage.MODEL,
            PipelineStage.SQL_VALIDATION,
            PipelineStage.QUERY,
        ),
        "g3_failed": (
            PipelineStage.ROUTER,
            PipelineStage.CONTROLLER,
            PipelineStage.CONTEXT,
            PipelineStage.CONTEXT_VALIDATION,
            PipelineStage.MODEL,
            PipelineStage.SQL_VALIDATION,
            PipelineStage.QUERY,
            PipelineStage.RESULT_VERIFICATION,
        ),
        "repaired": (
            PipelineStage.ROUTER,
            PipelineStage.CONTROLLER,
            PipelineStage.CONTEXT,
            PipelineStage.CONTEXT_VALIDATION,
            PipelineStage.MODEL,
            PipelineStage.SQL_VALIDATION,
            PipelineStage.REPAIR,
            PipelineStage.SQL_VALIDATION,
            PipelineStage.QUERY,
            PipelineStage.RESULT_VERIFICATION,
            PipelineStage.ARTIFACT,
        ),
    }.get(
        name,
        (
            PipelineStage.ROUTER,
            PipelineStage.CONTROLLER,
            PipelineStage.CONTEXT,
            PipelineStage.CONTEXT_VALIDATION,
            PipelineStage.MODEL,
            PipelineStage.SQL_VALIDATION,
            PipelineStage.QUERY,
            PipelineStage.RESULT_VERIFICATION,
            PipelineStage.ARTIFACT,
        ),
    )
    failed = name in {"timeout", "g3_failed"}
    blocked = name in {"g1_clarification", "g2_blocked"}
    return tuple(
        TraceStep(
            stage=stage,
            outcome=(
                StageOutcome.FAILED
                if failed and index == len(stages) - 1
                else StageOutcome.BLOCKED
                if blocked and index == len(stages) - 1
                else StageOutcome.BLOCKED
                if name == "repaired" and index == 5
                else StageOutcome.PASSED
            ),
        )
        for index, stage in enumerate(stages)
    )
