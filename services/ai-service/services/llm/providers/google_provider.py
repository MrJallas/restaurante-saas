from typing import Any, Optional
from ..base import LLMProvider


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
        # Gemini has its own tool format (FunctionDeclaration); the OpenAI-style
        # schema isn't directly compatible. F2 round only wires the OpenAI path.
        _ = tools  # noqa: F841 — explicit intent
        gen_model = self.genai.GenerativeModel(model)

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

        if system_instruction:
            gen_model = self.genai.GenerativeModel(
                model, system_instruction=system_instruction
            )

        chat = gen_model.start_chat(history=history[:-1] if len(history) > 1 else [])
        response = chat.send_message(
            last_msg,
            generation_config=self.genai.types.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            ),
        )

        tokens_in = response.usage_metadata.prompt_token_count if response.usage_metadata else 0
        tokens_out = response.usage_metadata.candidates_token_count if response.usage_metadata else 0

        return {
            "response": response.text or "",
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "model": model,
            "tool_calls": None,
        }

    async def classify(
        self,
        prompt: str,
        model: str,
        max_tokens: int = 50,
    ) -> dict:
        gen_model = self.genai.GenerativeModel(model)
        response = gen_model.generate_content(
            prompt,
            generation_config=self.genai.types.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=0.0,
            ),
        )

        tokens_in = response.usage_metadata.prompt_token_count if response.usage_metadata else 0
        tokens_out = response.usage_metadata.candidates_token_count if response.usage_metadata else 0

        return {
            "response": response.text or "",
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
        }

    def estimate_cost_cents(self, tokens_in: int, tokens_out: int, model: str) -> int:
        # Gemini pricing is very low
        cost = (tokens_in + tokens_out) * 0.00000025
        return max(1, int(cost * 100))
