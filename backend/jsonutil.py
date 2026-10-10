"""JSON responses with real numbers. Supabase returns numeric columns as strings ("33.00"); the frontend formats numbers,
so known numeric fields are converted on the way out. Applied to every endpoint via FastAPI(default_response_class=NumifyResponse)."""
from fastapi.responses import JSONResponse

NUM_KEYS = {
    "money_at_risk_usd", "days_of_cover", "weekly_demand", "stock_on_hand", "units_short", "gap_days", "predicted_delay_days",
    "delay_risk_score", "cause_confidence", "cost_usd", "cost_per_unit_covered", "unit_price", "order_item_total",
    "weekly_usage_forecast", "weekly_usage", "predicted_weekly_qty", "avg_predicted_delay_days", "late_risk_rate",
    "contribution", "contribution_days", "quantity", "eta_days", "units_covered",
}


def _num(s):
    try:
        f = float(s)
    except (TypeError, ValueError):
        return s
    return int(f) if f.is_integer() and "." not in s and "e" not in s.lower() else f


def numify(o):
    if isinstance(o, dict):
        return {k: (_num(v) if k in NUM_KEYS and isinstance(v, str) else numify(v)) for k, v in o.items()}
    if isinstance(o, list):
        return [numify(x) for x in o]
    return o


class NumifyResponse(JSONResponse):
    def render(self, content):
        return super().render(numify(content))