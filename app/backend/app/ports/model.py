from __future__ import annotations

from typing import Any, Protocol


class ModelAdapter(Protocol):
    """R3-owned contract. It cannot authorize SQL or make validation decisions."""

    def generate(self, node: str, payload: dict[str, Any]) -> dict[str, Any]: ...
