"""Simple project auth: own users table (app_users), PBKDF2 password check, signed JWT.
Role and scope are always read from the database, never from the caller or the token."""
import os
from dotenv import load_dotenv
load_dotenv()
import hmac
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from dataclasses import dataclass
from typing import Optional

import jwt
from fastapi import Header, HTTPException, Depends
from supabase import create_client, Client

JWT_SECRET = os.environ.get("JWT_SECRET", "runout-dev-secret-change-me")
JWT_HOURS = 12
_client: Optional[Client] = None


def data_client() -> Client:
    global _client
    if _client is None:
        _client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    return _client


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100_000).hex()
    return f"{salt}${h}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, h = stored.split("$", 1)
        test = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100_000).hex()
        return hmac.compare_digest(test, h)
    except Exception:
        return False


def make_token(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=JWT_HOURS)
    return jwt.encode({"sub": user_id, "exp": exp}, JWT_SECRET, algorithm="HS256")


@dataclass
class Scope:
    user_id: str
    email: str
    role: str                      # ops | warehouse | distributor | data
    display_name: Optional[str]
    distributor_id: Optional[int]
    warehouse_id: Optional[int]


def _scope_from_row(r) -> Scope:
    return Scope(user_id=r["user_id"], email=r["email"], role=r["role"], display_name=r.get("display_name"),
                 distributor_id=r.get("distributor_id"), warehouse_id=r.get("warehouse_id"))


def find_user_by_email(email: str):
    rows = data_client().table("app_users").select("*").eq("email", email.strip().lower()).limit(1).execute().data
    return rows[0] if rows else None


def current_scope(authorization: str = Header(None)) -> Scope:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        user_id = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])["sub"]
    except Exception as e:
        print("TOKEN ERROR:", type(e).__name__, e)
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    rows = data_client().table("app_users").select("*").eq("user_id", user_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=401, detail="Unknown user")
    return _scope_from_row(rows[0])


def require_roles(*roles):
    """Depends(require_roles('ops')) returns the Scope or raises 403."""
    def dep(scope: Scope = Depends(current_scope)) -> Scope:
        if scope.role not in roles:
            raise HTTPException(status_code=403, detail="Not allowed for your role")
        return scope
    return dep