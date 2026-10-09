"""Optional Langfuse tracing. Does nothing (and costs nothing) unless LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY are set
in .env and the `langfuse` package is installed. Supports Langfuse SDK v3 and v2."""
import os

from dotenv import load_dotenv

load_dotenv()

if os.environ.get("LANGFUSE_BASE_URL") and not os.environ.get("LANGFUSE_HOST"):
    os.environ["LANGFUSE_HOST"] = os.environ["LANGFUSE_BASE_URL"]
    
enabled = False


def _off():
    def observe(name=None, **kw):
        def deco(f):
            return f
        return deco
    return observe, (lambda: None)


observe, flush = _off()
if os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY"):
    try:
        try:
            from langfuse import observe as _observe, get_client            # SDK v3

            observe = lambda name=None, **kw: _observe(name=name, **kw)
            flush = lambda: get_client().flush()
        except ImportError:
            from langfuse.decorators import observe as _observe, langfuse_context   # SDK v2

            observe = lambda name=None, **kw: _observe(name=name, **kw)
            flush = lambda: langfuse_context.flush()
        enabled = True
    except Exception as e:
        print(f"(Langfuse tracing disabled: {type(e).__name__}: {str(e)[:80]})")
        observe, flush = _off()