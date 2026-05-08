"""Describe a dish — ingredients, allergens, prep style."""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    item_id = args.get("itemId") or args.get("item_id")
    if not item_id:
        return ToolResult(error={"code": "missing_item", "message": "qual prato?"})

    if ctx.api_client:
        try:
            details = ctx.api_client("GET", f"/menu/items/{item_id}", None)
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})
    else:
        details = {}

    name = (details or {}).get("name", "esse prato")
    desc = (details or {}).get("description")
    allergens = (details or {}).get("allergens", [])

    parts = [f"{name}:"]
    if desc:
        parts.append(desc)
    if allergens:
        parts.append("Alérgenos: " + ", ".join(allergens))

    return ToolResult(
        message=" ".join(parts),
        action_payload={"item": details},
    )
