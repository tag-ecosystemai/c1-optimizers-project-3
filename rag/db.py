"""
RunOut v2 — Database client for the RAG scripts
Location: rag/db.py

Uses SUPABASE_URL and SUPABASE_SERVICE_KEY from .env, exactly like the rest of the project.

If that key is a public ("publishable"/anon) key, the knowledge tables must NOT have
row-level security switched on, otherwise Supabase rejects the writes. Run
db/migrations/003b_rag_unlock_for_publishable_key.sql once to unlock them.
Set RAG_REQUIRE_SERVICE_KEY=1 in .env to make these scripts insist on a secret
(service_role) key again; do that after running the "re-lock" block in that file.
"""

import os
import json
import base64

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def _role_of(key):
    """Best-effort: which Supabase role does this key carry?"""
    if key.startswith("sb_secret_"):
        return "service_role"
    if key.startswith("sb_publishable_"):
        return "anon"
    try:
        payload = key.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload)).get("role", "unknown")
    except Exception:
        return "unknown"


def get_service_client():
    url = (os.environ.get("SUPABASE_URL") or "").strip()
    key = (os.environ.get("SUPABASE_SERVICE_KEY")
           or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env (see rag/db.py).")
    url = url.rstrip("/")
    if url.endswith("/rest/v1"):
        url = url[: -len("/rest/v1")]
    role = _role_of(key)
    if role in ("anon", "authenticated"):
        if os.environ.get("RAG_REQUIRE_SERVICE_KEY") == "1":
            raise RuntimeError(
                f"SUPABASE_SERVICE_KEY holds a '{role}' (public) key but RAG_REQUIRE_SERVICE_KEY=1. "
                "Use the secret / service_role key from Supabase: Project Settings -> API Keys.")
        print("NOTE: using a public Supabase key for the RAG tables. Row-level security on "
              "knowledge_* must be off (003b). Access control then rests on the code only.")
    from supabase import create_client
    return create_client(url, key)