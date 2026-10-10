"""Azure OpenAI chat wrapper with usage counting."""
import os
import json
from dotenv import load_dotenv
from agent import tracing

load_dotenv()
_client = None


def available() -> bool:
    return all(os.environ.get(k) for k in ("AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_CHAT_DEPLOYMENT"))


def client():
    global _client
    if _client is None:
        from openai import AzureOpenAI
        _client = AzureOpenAI(azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
                              api_key=os.environ["AZURE_OPENAI_API_KEY"],
                              api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21"))
    return _client

# $ per 1M tokens. Set LLM_PRICE_IN / LLM_PRICE_OUT in .env to match your Azure deployment.
def _price():
    return float(os.environ.get("LLM_PRICE_IN", "0.15")), float(os.environ.get("LLM_PRICE_OUT", "0.60"))


@tracing.observe(name="llm_call", as_type="generation")
def create(**kw):
    """Chat completion; retries without temperature for models that reject it. Logged to Langfuse with tokens and cost."""
    model = os.environ["AZURE_OPENAI_CHAT_DEPLOYMENT"]
    try:
        resp = client().chat.completions.create(model=model, temperature=0.1, **kw)
    except Exception as e:
        if "temperature" not in str(e).lower():
            raise
        resp = client().chat.completions.create(model=model, **kw)
    u = getattr(resp, "usage", None)
    if u:
        pin, pout = _price()
        cin, cout = u.prompt_tokens * pin / 1e6, u.completion_tokens * pout / 1e6
        tracing.update_generation(
            model=model,
            input=kw.get("messages"),
            output=resp.choices[0].message.content,
            usage_details={"input": u.prompt_tokens, "output": u.completion_tokens},
            cost_details={"input": cin, "output": cout, "total": cin + cout},
        )
    return resp


def count(usage: dict, resp):
    usage["calls"] = usage.get("calls", 0) + 1
    u = getattr(resp, "usage", None)
    if u:
        usage["prompt_tokens"] = usage.get("prompt_tokens", 0) + u.prompt_tokens
        usage["completion_tokens"] = usage.get("completion_tokens", 0) + u.completion_tokens


def chat_json(messages, usage: dict) -> dict:
    resp = create(messages=messages, response_format={"type": "json_object"})
    count(usage, resp)
    return json.loads(resp.choices[0].message.content)