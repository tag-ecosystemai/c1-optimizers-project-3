"""
RunOut v2 - Backend (FastAPI)
Location: backend/main.py
WS3 step 2: login, /api/me and health. Other endpoints come next (old file kept as main_old.py).
"""
import os
from dotenv import load_dotenv
load_dotenv()
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.auth import Scope, current_scope, find_user_by_email, make_token, verify_password
from backend.incidents import router as incidents_router
from backend.views import router as views_router
from backend.ask import router as ask_router
from backend.knowledge import router as knowledge_router



app = FastAPI(title="RunOut API")

ORIGINS = [o.strip() for o in os.environ.get(
    "FRONTEND_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_credentials=False,
                   allow_methods=["*"], allow_headers=["*"])

app.include_router(incidents_router)
app.include_router(views_router)
app.include_router(ask_router)
app.include_router(knowledge_router)

class LoginRequest(BaseModel):
    email: str
    password: str


def profile_dict(s: Scope) -> dict:
    return {"user_id": s.user_id, "email": s.email, "role": s.role, "display_name": s.display_name,
            "distributor_id": s.distributor_id, "warehouse_id": s.warehouse_id}


@app.post("/auth/login")
def login(req: LoginRequest):
    row = find_user_by_email(req.email)
    if not row or not verify_password(req.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return {
        "access_token": make_token(row["user_id"]),
        "user": {"id": row["user_id"], "email": row["email"], "role": row["role"],
                 "display_name": row.get("display_name"),
                 "distributor_id": row.get("distributor_id"), "warehouse_id": row.get("warehouse_id")},
    }


@app.get("/api/me")
def me(scope: Scope = Depends(current_scope)):
    return profile_dict(scope)


@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}