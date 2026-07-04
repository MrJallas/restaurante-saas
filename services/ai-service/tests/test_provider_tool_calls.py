"""
P1-G da auditoria 2026-07-03: os providers Anthropic e Google DESCARTAVAM os
tools silenciosamente (`_ = tools`) e sempre retornavam `tool_calls=None`. Em
qualquer deploy != OpenAI, "adiciona 2 coca" voltava só texto e nada entrava no
pedido (add_to_order morto). Além disso, o google_provider chamava o SDK
SÍNCRONO direto dentro de um `async def`, congelando o event loop inteiro.

Este módulo prova, via mocks do SDK de cada provider:
  1. Os tools no formato OpenAI (schemas.py) são MAPEADOS pro formato nativo
     de cada SDK e PASSADOS na chamada — não descartados.
  2. Uma resposta com tool_use (Anthropic) / function_call (Gemini) vira
     `tool_calls` no MESMO shape que o openai_provider entrega:
     [{id, type:"function", function:{name, arguments:<dict>}}].
  3. O google_provider roda o SDK síncrono via asyncio.to_thread (não bloqueia
     o event loop).

Testamos as funções de mapeamento puras (não instanciam o SDK real, que pode
não estar presente no ambiente de CI — mesmo padrão do `_openai_or_skip`).
"""

import asyncio
import time
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest

from services.tools.schemas import get_tool_schemas
from services.llm.providers import anthropic_provider as ap
from services.llm.providers import google_provider as gp


def _run(coro):
    """Roda uma coroutine num loop novo — evita depender de pytest-asyncio."""
    return asyncio.new_event_loop().run_until_complete(coro)


# ─────────────────────────────────────────────────────────────
# Anthropic: mapeamento tools OpenAI → Anthropic (input_schema)
# ─────────────────────────────────────────────────────────────


def test_anthropic_maps_openai_tools_to_anthropic_schema():
    """OpenAI envelope {type:function, function:{name,description,parameters}}
    vira o shape Anthropic {name, description, input_schema}."""
    schemas = get_tool_schemas()
    mapped = ap._to_anthropic_tools(schemas)

    assert mapped is not None
    assert len(mapped) == len(schemas)

    by_name = {t["name"]: t for t in mapped}
    assert "add_to_order" in by_name, "add_to_order deve sobreviver ao mapeamento"

    sample = by_name["add_to_order"]
    # shape nativo Anthropic — sem envelope `function`, com input_schema
    assert set(sample.keys()) >= {"name", "description", "input_schema"}
    assert "function" not in sample
    assert sample["input_schema"]["type"] == "object"
    assert isinstance(sample["input_schema"]["properties"], dict)


def test_anthropic_to_anthropic_tools_none_when_empty():
    assert ap._to_anthropic_tools(None) is None
    assert ap._to_anthropic_tools([]) is None


def test_anthropic_parses_tool_use_blocks_into_openai_shape():
    """Um bloco tool_use na resposta vira tool_calls no shape do openai_provider."""
    tool_use_block = SimpleNamespace(
        type="tool_use",
        id="toolu_abc",
        name="add_to_order",
        input={"itemId": "risoto-123", "quantity": 2},
    )
    text_block = SimpleNamespace(type="text", text="")

    tool_calls = ap._extract_tool_calls([text_block, tool_use_block])

    assert tool_calls is not None and len(tool_calls) == 1
    tc = tool_calls[0]
    assert tc["id"] == "toolu_abc"
    assert tc["type"] == "function"
    assert tc["function"]["name"] == "add_to_order"
    # arguments já vem como dict (Anthropic entrega input como objeto)
    assert tc["function"]["arguments"] == {"itemId": "risoto-123", "quantity": 2}


def test_anthropic_no_tool_use_returns_none():
    text_block = SimpleNamespace(type="text", text="olá")
    assert ap._extract_tool_calls([text_block]) is None
    assert ap._extract_tool_calls([]) is None


def test_anthropic_text_extracted_even_with_tool_use_present():
    """O texto do primeiro bloco text deve ser recuperado mesmo com tool_use junto."""
    blocks = [
        SimpleNamespace(type="text", text="Adicionando ao pedido"),
        SimpleNamespace(type="tool_use", id="t1", name="add_to_order", input={}),
    ]
    assert ap._extract_text(blocks) == "Adicionando ao pedido"


def test_anthropic_chat_forwards_tools_and_maps_response():
    """chat() passa os tools mapeados pro SDK e devolve tool_calls no shape certo."""
    schemas = get_tool_schemas()

    captured: dict[str, Any] = {}

    async def fake_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            content=[
                SimpleNamespace(type="text", text=""),
                SimpleNamespace(
                    type="tool_use",
                    id="toolu_1",
                    name="add_to_order",
                    input={"itemId": "coca-1", "quantity": 2},
                ),
            ],
            usage=SimpleNamespace(input_tokens=12, output_tokens=3),
        )

    provider = ap.AnthropicProvider.__new__(ap.AnthropicProvider)
    provider.client = SimpleNamespace(messages=SimpleNamespace(create=fake_create))

    out = _run(
        provider.chat(
            messages=[{"role": "user", "content": "adiciona 2 coca"}],
            model="claude-haiku-4-20250414",
            tools=schemas,
        )
    )

    # tools foram PASSADOS (não descartados) e no shape Anthropic
    assert "tools" in captured, "tools DEVE ser encaminhado ao SDK Anthropic"
    assert captured["tools"] is not None and len(captured["tools"]) == len(schemas)
    assert "input_schema" in captured["tools"][0]
    assert captured.get("tool_choice") == {"type": "auto"}

    # resposta mapeada
    assert out["tool_calls"] is not None and len(out["tool_calls"]) == 1
    tc = out["tool_calls"][0]
    assert tc["function"]["name"] == "add_to_order"
    assert tc["function"]["arguments"] == {"itemId": "coca-1", "quantity": 2}


def test_anthropic_chat_omits_tools_when_none():
    """Sem tools, o kwarg não deve ser enviado (e tool_calls=None)."""
    captured: dict[str, Any] = {}

    async def fake_create(**kwargs):
        captured.update(kwargs)
        return SimpleNamespace(
            content=[SimpleNamespace(type="text", text="oi")],
            usage=SimpleNamespace(input_tokens=1, output_tokens=1),
        )

    provider = ap.AnthropicProvider.__new__(ap.AnthropicProvider)
    provider.client = SimpleNamespace(messages=SimpleNamespace(create=fake_create))

    out = _run(
        provider.chat(messages=[{"role": "user", "content": "oi"}], model="m")
    )
    assert "tools" not in captured
    assert out["tool_calls"] is None


# ─────────────────────────────────────────────────────────────
# Google/Gemini: mapeamento tools OpenAI → FunctionDeclaration
# ─────────────────────────────────────────────────────────────


def test_google_maps_openai_tools_to_function_declarations():
    """OpenAI envelope vira {function_declarations:[{name,description,parameters}]}."""
    schemas = get_tool_schemas()
    mapped = gp._to_gemini_tools(schemas)

    assert mapped is not None and len(mapped) == 1  # um Tool com N declarations
    decls = mapped[0]["function_declarations"]
    assert len(decls) == len(schemas)

    by_name = {d["name"]: d for d in decls}
    assert "add_to_order" in by_name
    sample = by_name["add_to_order"]
    assert set(sample.keys()) >= {"name", "description", "parameters"}
    assert sample["parameters"]["type"] == "object"


def test_google_to_gemini_tools_none_when_empty():
    assert gp._to_gemini_tools(None) is None
    assert gp._to_gemini_tools([]) is None


def test_google_parses_function_call_into_openai_shape():
    """function_call nas parts vira tool_calls no shape do openai_provider."""
    fc = SimpleNamespace(name="add_to_order", args={"itemId": "coca-1", "quantity": 2})
    part_with_fn = SimpleNamespace(function_call=fc)
    part_text = SimpleNamespace(function_call=None, text="ok")

    candidate = SimpleNamespace(
        content=SimpleNamespace(parts=[part_text, part_with_fn])
    )
    response = SimpleNamespace(candidates=[candidate])

    tool_calls = gp._extract_tool_calls(response)
    assert tool_calls is not None and len(tool_calls) == 1
    tc = tool_calls[0]
    assert tc["type"] == "function"
    assert tc["function"]["name"] == "add_to_order"
    assert tc["function"]["arguments"] == {"itemId": "coca-1", "quantity": 2}


def test_google_no_function_call_returns_none():
    part_text = SimpleNamespace(function_call=None, text="oi")
    candidate = SimpleNamespace(content=SimpleNamespace(parts=[part_text]))
    response = SimpleNamespace(candidates=[candidate])
    assert gp._extract_tool_calls(response) is None
    # resposta sem candidates
    assert gp._extract_tool_calls(SimpleNamespace(candidates=[])) is None


def test_google_chat_runs_sdk_via_to_thread_and_maps_tools():
    """chat() do google: SDK síncrono roda em to_thread (não bloqueia o loop) e
    os tools são mapeados/passados; function_call vira tool_calls."""
    schemas = get_tool_schemas()
    captured: dict[str, Any] = {}
    thread_names: list[str] = []

    fc = SimpleNamespace(name="add_to_order", args={"itemId": "coca-1", "quantity": 2})
    fake_response = SimpleNamespace(
        candidates=[
            SimpleNamespace(
                content=SimpleNamespace(
                    parts=[SimpleNamespace(function_call=fc, text=None)]
                )
            )
        ],
        usage_metadata=SimpleNamespace(prompt_token_count=10, candidates_token_count=4),
        text="",
    )

    def fake_send_message(*args, **kwargs):
        # registra em qual thread o SDK síncrono foi chamado
        thread_names.append(asyncio.get_event_loop() if False else _current_thread())
        captured["send_args"] = args
        captured["send_kwargs"] = kwargs
        return fake_response

    fake_chat = SimpleNamespace(send_message=fake_send_message)

    class FakeGenerativeModel:
        def __init__(self, model, system_instruction=None, tools=None, **_):
            captured["model_tools"] = tools
            captured["model_system"] = system_instruction

        def start_chat(self, history=None):
            return fake_chat

    fake_genai = SimpleNamespace(
        GenerativeModel=FakeGenerativeModel,
        types=SimpleNamespace(GenerationConfig=lambda **kw: SimpleNamespace(**kw)),
    )

    provider = gp.GoogleProvider.__new__(gp.GoogleProvider)
    provider.genai = fake_genai

    main_thread = _current_thread()

    out = _run(
        provider.chat(
            messages=[{"role": "user", "content": "adiciona 2 coca"}],
            model="gemini-1.5-flash",
            tools=schemas,
        )
    )

    # SDK síncrono rodou EM OUTRA thread (to_thread) — não no loop principal
    assert thread_names, "send_message deveria ter sido chamado"
    assert thread_names[0] != main_thread, (
        "google_provider deve rodar o SDK síncrono via asyncio.to_thread; "
        "rodou na thread do event loop (bloqueia o loop)"
    )

    # tools mapeados e passados pro GenerativeModel
    assert captured.get("model_tools") is not None
    assert captured["model_tools"][0]["function_declarations"]

    # resposta mapeada pro shape OpenAI
    assert out["tool_calls"] is not None and len(out["tool_calls"]) == 1
    assert out["tool_calls"][0]["function"]["name"] == "add_to_order"
    assert out["tool_calls"][0]["function"]["arguments"] == {
        "itemId": "coca-1",
        "quantity": 2,
    }


def test_google_chat_does_not_block_event_loop():
    """Prova de concorrência: um send_message síncrono lento (0.4s) não pode
    congelar o event loop — outra coroutine deve progredir enquanto isso."""
    schemas = None

    def slow_send(*args, **kwargs):
        time.sleep(0.4)  # I/O síncrono lento
        return SimpleNamespace(
            candidates=[
                SimpleNamespace(
                    content=SimpleNamespace(
                        parts=[SimpleNamespace(function_call=None, text="ok")]
                    )
                )
            ],
            usage_metadata=SimpleNamespace(
                prompt_token_count=1, candidates_token_count=1
            ),
            text="ok",
        )

    class FakeGenerativeModel:
        def __init__(self, *a, **k):
            pass

        def start_chat(self, history=None):
            return SimpleNamespace(send_message=slow_send)

    fake_genai = SimpleNamespace(
        GenerativeModel=FakeGenerativeModel,
        types=SimpleNamespace(GenerationConfig=lambda **kw: SimpleNamespace(**kw)),
    )
    provider = gp.GoogleProvider.__new__(gp.GoogleProvider)
    provider.genai = fake_genai

    async def scenario():
        ticks = 0

        async def ticker():
            nonlocal ticks
            for _ in range(20):
                await asyncio.sleep(0.02)
                ticks += 1

        tick_task = asyncio.create_task(ticker())
        await provider.chat(
            messages=[{"role": "user", "content": "oi"}],
            model="gemini-1.5-flash",
            tools=schemas,
        )
        await tick_task
        return ticks

    ticks = _run(scenario())
    # Se o loop tivesse congelado por 0.4s, o ticker (0.02s cada) não teria
    # progredido durante o send_message. Com to_thread ele avança em paralelo.
    assert ticks >= 10, (
        f"o ticker só avançou {ticks}x — o send_message síncrono congelou o "
        "event loop (deveria rodar em asyncio.to_thread)"
    )


def _current_thread():
    import threading

    return threading.current_thread().name
