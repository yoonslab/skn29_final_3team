from __future__ import annotations

import sys
from pathlib import Path

from starlette.testclient import TestClient


ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "app" / "backend"
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402


def test_datahub_catalog_returns_five_sources_with_metrics():
    client = TestClient(app)
    response = client.get("/api/v1/datahub/catalog")

    assert response.status_code == 200
    payload = response.json()

    assert payload["version"] == "METRIC-GLOSSARY-v1.0.0-DRAFT"
    sources = payload["sources"]
    assert len(sources) == 5

    fqns = {source["fqn"] for source in sources}
    assert fqns == {"pms", "pos", "crm", "facility", "banquet"}

    for source in sources:
        assert source["urn"]
        assert source["engine"]
        assert source["owner"]
        assert source["status"]
        assert isinstance(source["metric_ids"], list)
        assert source["metric_ids"], f"{source['fqn']} has no metric_ids"

    all_metric_ids = {
        metric_id for source in sources for metric_id in source["metric_ids"]
    }
    assert all_metric_ids == {
        "recognized_room_revenue",
        "expired_points",
        "fnb_net_revenue",
        "facility_revenue",
        "actual_attendees",
    }
