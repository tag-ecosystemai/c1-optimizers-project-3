"""Offline tests: briefing guardrail, option rules and policy numbers. Run: pytest tests/test_guardrails.py -q"""
import datetime as dt

from agent import briefings as B
from agent.config import policy as P
from agent.options import build_options


def sample_ctx(as_of="2017-09-20", gap=2, short=4, money=400.0, sev="MEDIUM"):
    so = dt.date.fromisoformat(as_of) + dt.timedelta(days=3)
    first = so + dt.timedelta(days=gap)
    orders = [
        {"order_id": 1, "distributor_id": 7, "quantity": 4, "order_date": (dt.date.fromisoformat(as_of) - dt.timedelta(days=2)).isoformat(),
         "shipping_mode": "Standard Class", "order_total": 200.0, "projected_arrival": first.isoformat(),
         "scheduled_arrival": (first - dt.timedelta(days=2)).isoformat(), "predicted_delay_days": 2.2, "units_short": short},
        {"order_id": 2, "distributor_id": 8, "quantity": 2, "order_date": as_of, "shipping_mode": "Second Class", "order_total": 120.0,
         "projected_arrival": (first + dt.timedelta(days=1)).isoformat(), "scheduled_arrival": first.isoformat(),
         "predicted_delay_days": 1.0, "units_short": 0}]
    return {"incident_id": 9, "as_of": as_of, "severity": sev, "status": "open",
            "product": {"id": 1, "name": "Test Product", "unit_price": 50.0},
            "warehouse": {"warehouse_id": 3, "name": "Test Hub", "market": "Europe"}, "orders": orders,
            "distributors": {7: {"name": "Alpha Ltd"}, 8: {"name": "Beta Ltd"}},
            "risk": {"stock_on_hand": 28, "weekly_demand": 49.0, "days_of_cover": 3.9, "stockout_date": so.isoformat(),
                     "first_arrival": first.isoformat(), "gap_days": gap, "units_short": short, "money_at_risk_usd": money,
                     "avg_delay_risk_score": 0.6}}


# ---------------------------------------------------------------- guardrail
def facts():
    ctx = sample_ctx()
    opts, _ = build_options(ctx, [])
    rec = next(o for o in opts if o["recommended"])
    return B.build_facts(ctx, opts, rec, "No external evidence found", 0.2)


def test_rejects_invented_number():
    assert B.validate_text("Expect a delay of 77 days.", facts()[0], "sentence")


def test_rejects_invented_date():
    assert B.validate_text("It arrives on 30 December.", facts()[0], "sentence")


def test_accepts_date_from_facts():
    ops_f = facts()[0]
    d = dt.date.fromisoformat(ops_f["first_arrival"])
    assert not B.validate_text(f"It arrives on {d.day} {d.strftime('%B')}.", ops_f, "sentence")


def test_distributor_text_blocks_money_and_other_names():
    d = facts()[2]["7"]
    assert B.validate_text("You could lose $500 of margin.", d, "distributor")
    assert B.validate_text("Beta Ltd is also short.", d, "distributor", ["Beta Ltd"])


def test_word_limit_enforced():
    assert B.validate_text("word " * 130, facts()[2]["7"], "distributor")


def test_generated_briefings_pass_their_own_guardrail_and_leak_nothing():
    f = facts()
    texts, flags = B.finalize(f, {}, {}, False)
    assert not flags["problems"], flags["problems"]
    for did, t in texts["distributors"].items():
        assert not B.MONEY_RE.search(t), t
        others = [v["distributor_name"] for k, v in f[2].items() if k != did]
        assert not any(n in t for n in others)
    assert "Beta Ltd" not in texts["distributors"]["7"]


# ---------------------------------------------------------------- option rules (RO-OPS-002/004/005)
def test_exactly_one_recommended_and_costs_sane():
    for gap, short in [(0, 0), (1, 2), (2, 4), (4, 8), (12, 24)]:
        opts, _ = build_options(sample_ctx(gap=gap, short=short), [])
        assert sum(o["recommended"] for o in opts) == 1
        assert all(o["cost_usd"] >= 0 for o in opts)


def test_small_gap_low_money_recommends_notify_only():
    opts, _ = build_options(sample_ctx(as_of="2017-09-20", gap=1, short=2, money=33.0, sev="LOW"), [])
    assert next(o for o in opts if o["recommended"])["type"] == "notify_only"


def test_peak_season_treats_gap_2_as_3():
    _, notes = build_options(sample_ctx(as_of="2017-12-15", gap=2), [])
    assert any("Peak season" in n for n in notes)
    _, notes = build_options(sample_ctx(as_of="2017-09-20", gap=2), [])
    assert not any("Peak season" in n for n in notes)


def test_transfer_must_arrive_a_day_before_the_delayed_shipment():
    donor = [{"warehouse_id": 9, "name": "Far Hub", "market": "Africa", "available": 500}]
    opts, _ = build_options(sample_ctx(gap=2, short=4), donor)       # Africa to Europe takes 8 days; shipment arrives in about 5
    assert not [o for o in opts if o["type"] == "transfer"]


def test_air_transfer_only_for_high_severity():
    donor = [{"warehouse_id": 9, "name": "Near Hub", "market": "USCA", "available": 500}]
    ctx = sample_ctx(gap=12, short=24, money=900.0, sev="MEDIUM")
    assert not [o for o in build_options(ctx, donor)[0] if "air" in o["title"].lower()]
    ctx["severity"] = "HIGH"
    assert [o for o in build_options(ctx, donor)[0] if "air" in o["title"].lower()]


def test_priority_handling_never_offered_above_3_day_gap():
    opts, _ = build_options(sample_ctx(gap=5, short=8), [])
    assert not [o for o in opts if o["type"] == "priority_handling"]


# ---------------------------------------------------------------- tripwires: policy numbers must match the documents
def test_policy_numbers_match_documents():
    assert P.UPGRADE_COST_SHARE[("Standard Class", "First Class")] == 0.15
    assert P.UPGRADE_COST_SHARE[("Standard Class", "Same Day")] == 0.30
    assert P.UPGRADE_DAYS_SAVED[("Standard Class", "Same Day")] == 3.5
    assert P.PRIORITY == {"cost_share": 0.10, "days_recovered": 1, "max_gap_days": 3}
    assert P.TRANSFER["standard_flat"] == 150.0 and P.TRANSFER["air_flat"] == 400.0 and P.TRANSFER["donor_min_cover_days"] == 14
    assert P.TRANSFER_DAYS[frozenset(("USCA", "LATAM"))] == 7 and P.TRANSFER_DAYS[frozenset(("LATAM", "Africa"))] == 14
    assert len(P.TRANSFER_DAYS) == 10
    assert P.NOTIFY_ONLY_BELOW_USD == 100.0 and P.COVERAGE_TARGET == 0.80