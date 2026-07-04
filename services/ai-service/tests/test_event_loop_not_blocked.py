"""
P2 da auditoria 2026-07-03: `dispatch_tool` é SÍNCRONO (httpx.Client +
redis-py) e era chamado direto dentro das rotas async — um tool lento
(timeout de 10s do api_client) congelava o event loop inteiro: nenhum
outro request (nem /health) respondia enquanto isso.

Este teste prova concorrência de verdade: um /chat com tool artificialmente
lento (0.6s de sleep SÍNCRONO) não pode atrasar um /health disparado junto.
"""

import asyncio
import time

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import AsyncMock, MagicMock

import main


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_tool_lento_nao_congela_o_event_loop(monkeypatch):
    fake_provider = MagicMock()
    fake_provider.chat = AsyncMock(
        return_value={
            "response": "llm",
            "tokens_in": 1,
            "tokens_out": 1,
            "model": "m",
            "tool_calls": [],
        }
    )
    fake_provider.estimate_cost_cents = MagicMock(return_value=0)
    monkeypatch.setattr(main, "get_provider", lambda: fake_provider)
    monkeypatch.setattr(main, "_api_client", None)

    real_dispatch = main.dispatch_tool

    def slow_dispatch(name, args, ctx):
        time.sleep(0.6)  # I/O síncrono lento (como o httpx.Client no timeout)
        return real_dispatch(name, args, ctx)

    monkeypatch.setattr(main, "dispatch_tool", slow_dispatch)

    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:

        async def slow_chat():
            # "quero ver o cardápio" resolve no rule-layer → dispatch_tool
            return await client.post(
                "/chat",
                json={"message": "quero ver o cardápio", "tenantId": "restaurant_dev"},
            )

        # O relógio parte ANTES do /chat entrar: se o dispatch síncrono
        # congelar o loop, até o time.sleep(0.05) abaixo só retorna depois
        # do freeze — e o /health termina tarde em relação a t0.
        t0 = time.perf_counter()
        chat_task = asyncio.create_task(slow_chat())
        await asyncio.sleep(0.05)  # cede o loop pro /chat entrar primeiro
        health_res = await client.get("/health")
        health_done_at = time.perf_counter() - t0
        chat_res = await chat_task

    assert chat_res.status_code == 200
    assert health_res.status_code == 200
    assert health_done_at < 0.4, (
        f"/health só terminou {health_done_at:.2f}s depois do /chat entrar — "
        "o dispatch_tool síncrono congelou o event loop"
    )
