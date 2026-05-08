"""
List allergens for a given set of dishes.

Accepts `itemIds: string[]` or a single `itemId: string`. Hits the menu
endpoint to collect allergen lists per dish, returns a concatenated
human-readable summary.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    item_ids = args.get("itemIds") or args.get("item_ids") or []
    single = args.get("itemId") or args.get("item_id")
    if single:
        item_ids = [*item_ids, single]
    if not item_ids:
        return ToolResult(error={
            "code": "missing_items",
            "message": "quais pratos você quer checar alérgenos?",
        })

    if not ctx.api_client:
        # No backend wired — return stub so callers can short-circuit gracefully.
        return ToolResult(
            message="Não consegui consultar os alérgenos agora. Posso chamar o garçom?",
            action_payload={"status": "not_implemented", "tool": "check_allergens", "itemIds": item_ids},
        )

    findings: list[dict] = []
    for iid in item_ids:
        try:
            res = ctx.api_client("GET", f"/menu/items/{iid}", None) or {}
            findings.append({
                "itemId": iid,
                "name": res.get("name", ""),
                "allergens": res.get("allergens", []),
            })
        except Exception as e:
            return ToolResult(error={"code": "api_error", "message": str(e)})

    if not findings:
        return ToolResult(message="Não achei alérgenos nesses itens.")

    lines = []
    for f in findings:
        allergens = f.get("allergens") or []
        name = f.get("name") or f.get("itemId")
        if allergens:
            lines.append(f"- {name}: {', '.join(allergens)}")
        else:
            lines.append(f"- {name}: sem alérgenos comuns")

    return ToolResult(
        message="Alérgenos:\n" + "\n".join(lines),
        action_payload={"items": findings},
    )
