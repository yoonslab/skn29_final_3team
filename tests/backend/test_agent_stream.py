from __future__ import annotations

import json
import sys
from pathlib import Path

from starlette.testclient import TestClient


ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "app" / "backend"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402

CONTRACT_VERSION = "OPENAPI-v1.0.0"


def context_headers(trace_id: str = "agent-stream-trace") -> dict[str, str]:
    return {
        "Authorization": "Bearer agent-stream-token",
        "X-User-Id": "00000000-0000-0000-0000-000000000001",
        "X-Role": "hotel_analyst",
        "X-As-Of": "2026-07-30",
        "X-Trace-Id": trace_id,
        "X-Timezone": "Asia/Seoul",
        "X-Contract-Version": CONTRACT_VERSION,
    }


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    for block in body.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        event_name = None
        data = None
        for line in block.split("\n"):
            if line.startswith("event: "):
                event_name = line[len("event: "):]
            elif line.startswith("data: "):
                data = json.loads(line[len("data: "):])
        if event_name is not None and data is not None:
            events.append((event_name, data))
    return events


def test_agent_stream_emits_all_seven_trace_steps_then_result_and_done():
    client = TestClient(app)
    with client.stream(
        "POST",
        "/api/v1/agent/analyze/stream",
        headers=context_headers(),
        json={"question": "오늘 객실 운영 상태를 요약해줘"},
    ) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        body = "".join(response.iter_text())

    events = parse_sse(body)
    names = [name for name, _data in events]

    trace_events = [data for name, data in events if name == "trace"]
    assert len(trace_events) == 7
    assert [data["step"] for data in trace_events] == [1, 2, 3, 4, 5, 6, 7]
    assert all(data["status"] == "done" for data in trace_events)
    assert all(data["label"] for data in trace_events)

    result_events = [data for name, data in events if name == "result"]
    assert len(result_events) == 1
    assert result_events[0]["artifact_id"]

    done_events = [data for name, data in events if name == "done"]
    assert len(done_events) == 1
    assert done_events[0]["trace_id"] == "agent-stream-trace"
    assert isinstance(done_events[0]["duration_ms"], int)

    assert names[-1] == "done"
    assert "error" not in names


def test_agent_stream_g1_blocked_emits_blocked_trace_and_error():
    client = TestClient(app)
    with client.stream(
        "POST",
        "/api/v1/agent/analyze/stream",
        headers=context_headers("agent-stream-blocked"),
        json={
            "question": "합성 객실 운영 현황",
            "parameters": {"scenario": "clarification"},
        },
    ) as response:
        assert response.status_code == 200
        body = "".join(response.iter_text())

    events = parse_sse(body)
    names = [name for name, _data in events]

    trace_events = [data for name, data in events if name == "trace"]
    assert trace_events
    assert trace_events[-1]["status"] == "blocked"
    assert trace_events[-1]["step"] == 2

    error_events = [data for name, data in events if name == "error"]
    assert len(error_events) == 1
    assert error_events[0]["code"] == "CONTEXT_INCOMPLETE"
    assert error_events[0]["message"]

    assert "result" not in names
    assert names[-1] == "done"
