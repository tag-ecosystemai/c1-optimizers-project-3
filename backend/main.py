"""
RunOut v2 — Backend (FastAPI)
Location: backend/main.py

FastAPI application serving the RunOut frontend.
Uses Supabase Auth for user authentication.

Endpoints:
  - POST /auth/signup
  - POST /auth/login
  - GET /api/incidents
  - GET /api/incident/{id}
  - POST /api/ask
  - POST /api/approve/{incident_id}
  - GET /api/observability/metrics
  - GET /api/warehouse/inventory
  - GET /api/distributor/orders
"""

import os
from datetime import date, datetime
from typing import Optional
from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client

app = FastAPI(title="RunOut API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def get_sb():
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization.split(" ", 1)[1]
    sb = get_sb()
    user = sb.auth.get_user(token)
    return user


def get_user_role(user) -> str:
    return user.user_metadata.get("role", "distributor")


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    email: str
    password: str
    role: str = "distributor"  # ops | warehouse | distributor


class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/auth/signup")
def signup(req: SignupRequest):
    sb = get_sb()
    try:
        result = sb.auth.sign_up({
            "email": req.email,
            "password": req.password,
            "options": {"data": {"role": req.role}},
        })
        return {"user_id": result.user.id, "email": result.user.email}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/login")
def login(req: LoginRequest):
    sb = get_sb()
    try:
        result = sb.auth.sign_in_with_password({
            "email": req.email,
            "password": req.password,
        })
        return {
            "access_token": result.session.access_token,
            "user": {
                "id": result.user.id,
                "email": result.user.email,
                "role": result.user.user_metadata.get("role", "distributor"),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    query: str
    distributor_id: Optional[int] = None


@app.get("/api/incidents")
def list_incidents(
    role: Optional[str] = None,
    market: Optional[str] = None,
    distributor_id: Optional[int] = None,
    limit: int = 50,
    user=Depends(get_current_user),
):
    sb = get_sb()
    user_role = get_user_role(user)

    query = sb.table("cascade_results").select(
        "*,orders!inner(order_id,distributor_id,order_item_total,order_region,shipping_mode)"
    ).order("money_at_risk_usd", desc=True).limit(limit)

    if user_role == "distributor":
        # Distributors only see their own orders
        dist = sb.table("distributors").select("distributor_id").eq("email", user.email).execute()
        if dist.data:
            query = query.eq("orders.distributor_id", dist.data[0]["distributor_id"])

    if distributor_id:
        query = query.eq("orders.distributor_id", distributor_id)
    if market:
        query = query.eq("orders.order_region", market)

    return {"incidents": query.execute().data}


@app.get("/api/incident/{incident_id}")
def get_incident(incident_id: int, user=Depends(get_current_user)):
    sb = get_sb()
    result = sb.table("cascade_results").select(
        "*,orders!inner(*)",
    ).eq("cascade_id", incident_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Incident not found")

    return {"incident": result.data[0]}


@app.post("/api/ask")
def ask_agent(req: AskRequest, user=Depends(get_current_user)):
    """
    Agent endpoint. In production, this would trigger the LangGraph agent.
    For now, returns a structured stub response.
    """
    # TODO: Connect to LangGraph agent once built
    # agent_response = run_agent(req.query, req.distributor_id)
    return {
        "query": req.query,
        "response": f"[Agent would investigate: '{req.query}']",
        "status": "agent_not_connected",
    }


class ApproveRequest(BaseModel):
    action: str  # approve | dismiss | escalate


@app.post("/api/approve/{incident_id}")
def approve_incident(incident_id: int, req: ApproveRequest, user=Depends(get_current_user)):
    user_role = get_user_role(user)
    if user_role != "ops":
        raise HTTPException(status_code=403, detail="Only operations manager can approve actions")

    sb = get_sb()
    sb.table("incidents").update({
        "status": req.action,
        "resolved_at": datetime.utcnow().isoformat(),
    }).eq("incident_id", incident_id).execute()

    return {"status": f"incident {incident_id} {req.action}d"}


@app.get("/api/observability")
def get_observability_hub(user=Depends(get_current_user)):
    sb = get_sb()

    # Quick status summaries from each tool
    total_orders = sb.table("orders").select("*", count="exact").limit(0).execute().count
    total_predictions = sb.table("predictions").select("*", count="exact").limit(0).execute().count

    at_risk = sb.table("cascade_results").select("cascade_id") \
        .gt("money_at_risk_usd", 0).execute()
    active_incidents = len(at_risk.data) if at_risk.data else 0

    return {
        "status": "all_systems_operational",
        "last_updated": date.today().isoformat(),
        "links": {
            "langfuse": {
                "url": "https://cloud.langfuse.com",
                "label": "Agent Traces",
                "description": "View every agent tool call, cost, and latency",
                "status": "connected" if os.environ.get("LANGFUSE_PUBLIC_KEY") else "not_configured",
            },
            "dagshub": {
                "url": "https://dagshub.com/RunOut/runout-ml",
                "label": "MLflow / Model Registry",
                "description": "Training runs, model comparison, champion promotion",
                "status": "connected",
            },
            "grafana": {
                "url": os.environ.get("GRAFANA_URL", "https://grafana.com"),
                "label": "Grafana Dashboard",
                "description": "System health, data drift, ingestion metrics",
                "status": "connected" if os.environ.get("GRAFANA_URL") else "not_configured",
            },
            "supabase": {
                "url": os.environ.get("SUPABASE_URL", "").replace("/rest/v1", ""),
                "label": "Supabase Database",
                "description": "Raw data: orders, inventory, signals, predictions",
                "status": "connected",
            },
        },
        "summary": {
            "total_orders": (total_orders or 0),
            "total_predictions": (total_predictions or 0),
            "active_incidents": active_incidents,
            "models_trained": {
                "m1": "pending" if total_predictions == 0 else "active",
                "m2": "pending",
            },
        },
    }


@app.get("/api/warehouse/inventory")
def get_warehouse_inventory(
    warehouse_id: Optional[int] = None,
    user=Depends(get_current_user),
):
    sb = get_sb()
    query = sb.table("warehouse_inventory").select(
        "*,products(name,category_name),warehouses(name,market)"
    ).order("stock_on_hand", desc=True)

    if warehouse_id:
        query = query.eq("warehouse_id", warehouse_id)

    return {"inventory": query.execute().data}


@app.get("/api/distributor/orders")
def get_distributor_orders(
    distributor_id: Optional[int] = None,
    limit: int = 20,
    user=Depends(get_current_user),
):
    sb = get_sb()
    user_role = get_user_role(user)

    query = sb.table("orders").select(
        "*,products(name),distributors(name,customer_segment,market)"
    ).order("order_date", desc=True).limit(limit)

    if user_role == "distributor":
        dist = sb.table("distributors").select("distributor_id").eq("email", user.email).execute()
        if dist.data:
            query = query.eq("distributor_id", dist.data[0]["distributor_id"])
    elif distributor_id:
        query = query.eq("distributor_id", distributor_id)

    return {"orders": query.execute().data}


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}