"""
Request table merge — "junta minha mesa com a mesa N" (canonical name per F2).

Renamed from `table_merge_request` (also kept registered as a deprecated
alias). Per `customer-host-model.md` lines 178+. Handles 429 cooldown
gracefully: when origin × target was recently rejected/timed-out, backend
returns 429 and the LLM renders a friendly cooldown message instead of
retrying.
"""

from typing import Any
from .types import ToolContext, ToolResult


def call(args: dict[str, Any], ctx: ToolContext) -> ToolResult:
    target_table = args.get("targetTable") or args.get("target_table")
    if not target_table:
        return ToolResult(error={
            "code": "missing_target",
            "message": "qual mesa você quer juntar?",
        })

    if not ctx.api_client:
        return ToolResult(error={"code": "no_api_client"})

    try:
        # Path canonicalised against `apps/api/.../table-merge.controller.ts`:
        # @Controller(':slug/table-merge-requests'). The `tenant_id` on
        # ToolContext is the slug; api_client prepends the API base URL.
        # Body shape mirrors `CreateMergeDto` (sourceTableSessionId +
        # targetTableSessionId + requestingCustomerId). The LLM only knows
        # a table label — backend resolves it to a session id; until that
        # mapping is done client-side we send the label as `targetLabel`
        # for backend lookup. The original request_table_merge call here
        # was hitting `POST /customer/table-merges` which 404's.
        res = ctx.api_client("POST", f"/{ctx.tenant_id}/table-merge-requests", {
            "originTableSessionId": ctx.session_id,
            "targetTableLabel": target_table,
            "requestingCustomerId": ctx.customer_id,
        })
    except Exception as e:
        # Cooldown path: spec mandates a friendly response, not an error bubble
        status = getattr(e, "status_code", None) or getattr(e, "status", None)
        if status == 429:
            return ToolResult(
                message=(
                    "Essa junção foi tentada há pouco e não rolou. "
                    "Dá uns minutos e eu tento de novo, beleza?"
                ),
                action_payload={"cooldown": True, "targetTable": target_table},
            )
        return ToolResult(error={"code": "api_error", "message": str(e)})

    return ToolResult(
        message=(
            f"Mandei pedido pra juntar com a mesa {target_table}. "
            "Tô esperando a galera de lá confirmar."
        ),
        action_payload={"tableMergeRequest": res},
    )
