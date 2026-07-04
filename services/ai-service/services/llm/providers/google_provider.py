import asyncio
import logging
from typing import Any, Optional
from ..base import LLMProvider

logger = logging.getLogger(__name__)


def _to_gemini_tools(
    tools: Optional[list[dict[str, Any]]],
) -> Optional[list[dict[str, Any]]]:
    """Map OpenAI-style tool schemas → Gemini function-calling format.

    OpenAI envelope (see services/tools/schemas.py):
        {"type": "function",
         "function": {"name", "description", "parameters": {...json schema...}}}

    Gemini wants a list of Tool objects, each carrying a list of
    FunctionDeclaration. The dict form below is accepted by the
    google-generativeai SDK directly:
        [{"function_declarations": [{"name", "description", "parameters"}, ...]}]

    We collapse every function into a single Tool. Returns None when there's
    nothing to send so `chat()` can skip the tools kwarg.
    """
    if not tools:
        return None
    declarations: list[dict[str, Any]] = []
    for t in tools:
        fn = t.get("function") if isinstance(t, dict) else None
        if not fn:
            continue
        name = fn.get("name")
        if not name:
            continue
        declarations.append(
            {
                "name": name,
                "description": fn.get("description", ""),
                # Gemini keeps the OpenAI key name `parameters` (JSON Schema).
                "parameters": fn.get("parameters")
                or {"type": "object", "properties": {}},
            }
        )
    if not declarations:
        return None
    return [{"function_declarations": declarations}]


def _extract_tool_calls(response: Any) -> Optional[list[dict[str, Any]]]:
    """Map Gemini `function_call` parts → the normalised OpenAI shape the rest of
    ai-service expects (same as openai_provider):
        [{id, type:"function", function:{name, arguments:<dict>}}]

    Gemini delivers args as a proto Map/dict-like; we coerce to a plain dict.
    Gemini function calls carry no id, so we synthesise a stable one per index.
    """
    candidates = getattr(response, "candidates", None) or []
    tool_calls: list[dict[str, Any]] = []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            fn = getattr(part, "function_call", None)
            if not fn:
                continue
            name = getattr(fn, "name", None)
            if not name:
                continue
            raw_args = getattr(fn, "args", None)
            # proto Map → dict; already-dict passes through; anything else → {}
            try:
                args = dict(raw_args) if raw_args is not None else {}
            except (TypeError, ValueError):
                args = {}
            tool_calls.append(
                {
                    "id": f"call_{len(tool_calls)}",
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": args,
                    },
                }
            )
    return tool_calls or None


class GoogleProvider(LLMProvider):
    def __init__(self, api_key: str):
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        self.genai = genai

    async def chat(
        self,
        messages: list[dict],
        model: str,
        max_tokens: int = 500,
        temperature: float = 0.7,
        tools: Optional[list[dict[str, Any]]] = None,
    ) -> dict:
        # P1-G: previously `_ = tools` dropped the schemas silently AND the
        # synchronous SDK call ran directly inside this async def — freezing the
        # whole event loop for the duration of the request. Both fixed here:
        # tools are mapped/forwarded, and the blocking SDK call runs in a thread.
        gemini_tools = _to_gemini_tools(tools)

        # Convert messages to Gemini format
        history = []
        system_instruction = ""
        last_msg = ""
        for msg in messages:
            if msg["role"] == "system":
                system_instruction = msg["content"]
            elif msg["role"] == "user":
                last_msg = msg["content"]
                history.append({"role": "user", "parts": [msg["content"]]})
            elif msg["role"] == "assistant":
                history.append({"role": "model", "parts": [msg["content"]]})

        model_kwargs: dict[str, Any] = {}
        if system_instruction:
            model_kwargs["system_instruction"] = system_instruction
        if gemini_tools:
            model_kwargs["tools"] = gemini_tools

        gen_model = self.genai.GenerativeModel(model, **model_kwargs)
        generation_config = self.genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        chat = gen_model.start_chat(
            history=history[:-1] if len(history) > 1 else []
        )

        # SDK síncrono → thread, pra não bloquear o event loop (padrão que o 1C
        # já aplicou no ai-service: asyncio.to_thread(dispatch_tool, ...)).
        response = await asyncio.to_thread(
            chat.send_message,
            last_msg,
            generation_config=generation_config,
        )

        tokens_in = (
            response.usage_metadata.prompt_token_count
            if response.usage_metadata
            else 0
        )
        tokens_out = (
            response.usage_metadata.candidates_token_count
            if response.usage_metadata
            else 0
        )

        tool_calls = _extract_tool_calls(response)
        # `response.text` raises when the candidate is a pure function_call with
        # no text part — guard so a tool-only turn doesn't blow up.
        text = ""
        if tool_calls is None:
            try:
                text = response.text or ""
            except (ValueError, AttributeError):
                text = ""

        return {
            "response": text,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "model": model,
            "tool_calls": tool_calls,
        }

    async def classify(
        self,
        prompt: str,
        model: str,
        max_tokens: int = 50,
    ) -> dict:
        gen_model = self.genai.GenerativeModel(model)
        generation_config = self.genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=0.0,
        )
        response = await asyncio.to_thread(
            gen_model.generate_content,
            prompt,
            generation_config=generation_config,
        )

        tokens_in = (
            response.usage_metadata.prompt_token_count
            if response.usage_metadata
            else 0
        )
        tokens_out = (
            response.usage_metadata.candidates_token_count
            if response.usage_metadata
            else 0
        )

        return {
            "response": response.text or "",
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
        }

    def estimate_cost_cents(self, tokens_in: int, tokens_out: int, model: str) -> int:
        # Gemini pricing is very low
        cost = (tokens_in + tokens_out) * 0.00000025
        return max(1, int(cost * 100))
