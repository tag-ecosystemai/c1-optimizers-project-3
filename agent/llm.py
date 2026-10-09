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

@tracing.observe(name="llm_call")
def create(**kw):
    """Chat completion; retries without temperature for models that reject it."""
    model = os.environ["AZURE_OPENAI_CHAT_DEPLOYMENT"]
    try:
        return client().chat.completions.create(model=model, temperature=0.1, **kw)
    except Exception as e:
        if "temperature" in str(e).lower():
            return client().chat.completions.create(model=model, **kw)
        raise


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