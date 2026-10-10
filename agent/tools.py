"""Weather, news and delay-statistics tools. All take dates around the SIMULATED date (never today's real date).
Results are cached in the `signals` table. Fetched text is untrusted data. Run `python agent/tools.py` to test."""
import os
import re
import sys
import json
import time
import datetime as dt

import httpx

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from backend.auth import data_client  # noqa: E402
from cascade.db_utils import fetch_all  # noqa: E402
from agent import tracing  # noqa: E402

HUBS = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "config", "market_hubs.json"), encoding="utf-8"))
UA = {"User-Agent": "runout-student-project/1.0"}
EXCLUDED = {"CANCELED", "SUSPECTED_FRAUD"}
SEVERE_RAIN_MM, SEVERE_GUST_KMH = 50.0, 75.0          # assumptions, labelled as such in the summaries
ALL_MODES = ["Standard Class", "Second Class", "First Class", "Same Day"]

DISRUPT = re.compile(r"\b(?:strike|strikes|port|ports|shipping|freight|cargo|customs|border|storm|hurricane|typhoon|"
                     r"cyclone|flood|floods|flooding|earthquake|blockade|embargo|protest|protests|congestion|"
                     r"airport|railway|derailment|closure)\b", re.I)
MARKET_WORDS = {
    "Europe": r"Europe|European|Germany|German|France|French|Netherlands|Dutch|Rotterdam|Hamburg|Spain|Italy|Belgium|Poland|Britain|United Kingdom|Brexit",
    "USCA": r"United States|U\.S\.|America|Canada|California|Texas|New York|Florida|Houston|Los Angeles|Harvey|Irma",
    "LATAM": r"Brazil|Mexico|Argentina|Chile|Colombia|Peru|Panama|Caribbean|Latin America|Venezuela",
    "Africa": r"Nigeria|Lagos|Kenya|Ghana|South Africa|Egypt|Ethiopia|Africa|Durban",
    "Pacific Asia": r"Singapore|China|Chinese|Japan|Australia|Sydney|Philippines|Indonesia|Vietnam|Korea|Asia|Pacific|Taiwan|Hong Kong",
}


# ---------------------------------------------------------------- cache + http
def _cache_get(kind, key):
    try:
        r = (data_client().table("signals").select("payload").eq("signal_type", kind)
             .eq("reference_key", key).limit(1).execute().data)
        return r[0]["payload"] if r else None
    except Exception:
        return None


def _cache_put(kind, source, key, payload, as_of, day):
    try:
        data_client().table("signals").insert({"signal_type": kind, "source": source, "reference_key": key,
                                               "payload": payload, "as_of_date": as_of, "signal_day": day}).execute()
    except Exception as e:
        print(f"  (cache write skipped: {str(e)[:80]})")


def _get(url, params=None, tries=4):
    last = None
    for i in range(tries):
        try:
            r = httpx.get(url, params=params, headers=UA, timeout=30, follow_redirects=True)
            if r.status_code in (429, 500, 502, 503, 504):
                last = r.status_code
                time.sleep(2 ** i * 2)
                continue
            r.raise_for_status()
            return r
        except httpx.HTTPError as e:
            last = type(e).__name__
            time.sleep(2 ** i)
    raise RuntimeError(f"source unavailable ({last})")

SIM_FROM = dt.date(2026, 1, 1)      # from this date the world is simulated: use the simulated events, not live weather or news


def sim_event_items(market, start, end):
    """Simulated disruption events overlapping the window, formatted as evidence. Always labelled as simulated."""
    try:
        rows = (data_client().table("sim_events").select("*").eq("market", market)
                .lte("start_date", end).gte("end_date", start).execute().data)
    except Exception:
        return []
    out = []
    for r in rows:
        weather = r["event_type"] in ("storm", "typhoon")
        out.append({"type": "weather" if weather else "news", "source": "SIMULATED event (RunOut simulation, not real)",
                    "summary": f"{r['title']}: {r['description']} ({r['start_date']} to {r['end_date']}). This event is simulated for the demo.",
                    "url": None, "timestamp": f"{r['end_date']}T00:00:00Z", "_severe": weather})
    return out

# ---------------------------------------------------------------- weather
@tracing.observe(name="tool_get_weather")
def get_weather(market, start, end, as_of):
    """One evidence item per hub (max 2). Items carry a private `_severe` flag the caller removes."""
    out = []
    for hub in HUBS.get(market, [])[:2]:
        key = f"{hub['name']}|{start}|{end}"
        url = (f"https://archive-api.open-meteo.com/v1/archive?latitude={hub['lat']}&longitude={hub['lon']}"
               f"&start_date={start}&end_date={end}&daily=precipitation_sum,wind_gusts_10m_max")
        payload = _cache_get("weather", key)
        if payload is None:
            try:
                j = _get("https://archive-api.open-meteo.com/v1/archive",
                         {"latitude": hub["lat"], "longitude": hub["lon"], "start_date": start, "end_date": end,
                          "daily": "precipitation_sum,wind_gusts_10m_max", "timezone": "UTC"}).json()["daily"]
                payload = {"days": j["time"], "rain": j["precipitation_sum"], "gust": j["wind_gusts_10m_max"]}
                _cache_put("weather", "open-meteo-archive", key, payload, as_of, start)
            except Exception as e:
                out.append({"type": "weather", "source": "Open-Meteo archive (source unavailable)",
                            "summary": f"Weather data for {hub['name']} could not be retrieved ({e}).",
                            "url": None, "timestamp": f"{end}T00:00:00Z", "_severe": False})
                continue
        rain = [x or 0 for x in payload["rain"]]
        gust = [x or 0 for x in payload["gust"]]
        severe = max(rain, default=0) >= SEVERE_RAIN_MM or max(gust, default=0) >= SEVERE_GUST_KMH
        wet = payload["days"][rain.index(max(rain))] if rain else start
        out.append({"type": "weather", "source": "Open-Meteo historical archive",
                    "summary": (f"{hub['name']} {start} to {end}: highest daily rain {max(rain, default=0):.0f} mm "
                                f"(on {wet}), strongest gust {max(gust, default=0):.0f} km/h. "
                                + ("Above the severe-weather screen (50 mm rain or 75 km/h gust; assumed thresholds)."
                                   if severe else "No severe-weather signal.")),
                    "url": url, "timestamp": f"{end}T00:00:00Z", "_severe": bool(severe)})
    return out + [i for i in sim_event_items(market, start, end) if i["type"] == "weather"]


# ---------------------------------------------------------------- news (Wikipedia Current Events)
def _clean(line):
    s = re.sub(r"<ref[^>]*>.*?</ref>|<ref[^>]*/>|<[^>]+>", "", line)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+ ([^\]]+)\]", r"\1", s)
    s = s.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", s).strip(" *:")


def _wiki_lines(day: dt.date):
    """Disruption-related bullet lines for one day (cached). Empty list if the page is missing."""
    key = f"wiki|{day.isoformat()}"
    cached = _cache_get("news", key)
    if cached is not None:
        return cached.get("lines", [])
    title = f"Portal:Current_events/{day.year}_{day.strftime('%B')}_{day.day}"
    try:
        j = _get("https://en.wikipedia.org/w/api.php", {"action": "parse", "page": title, "prop": "wikitext",
                                                         "format": "json", "formatversion": 2}).json()
        text = j["parse"]["wikitext"]
    except Exception:
        return []
    lines = [c for c in (_clean(l) for l in text.splitlines() if l.lstrip().startswith("*")) if len(c) > 25 and DISRUPT.search(c)]
    _cache_put("news", "wikipedia-current-events", key, {"title": title, "lines": lines}, day.isoformat(), day.isoformat())
    return lines

@tracing.observe(name="tool_search_news")
def search_news(market, start, end, as_of, max_items=3):
    """Curated historical context from Wikipedia Current Events. A matching headline is context, never proof of cause."""
    s, e = dt.date.fromisoformat(start), dt.date.fromisoformat(end)
    s = max(s, e - dt.timedelta(days=6))
    words = re.compile(MARKET_WORDS.get(market, "$^"), re.I)
    items, day = [], e
    while day >= s and len(items) < max_items:
        for line in _wiki_lines(day):
            if words.search(line) and len(items) < max_items:
                items.append({"type": "news", "source": "Wikipedia Current Events (curated aggregator)",
                              "summary": line[:220], "url": f"https://en.wikipedia.org/wiki/Portal:Current_events/{day.year}_{day.strftime('%B')}_{day.day}",
                              "timestamp": f"{day.isoformat()}T00:00:00Z"})
        day -= dt.timedelta(days=1)
    sim = [{k: v for k, v in i.items() if k != "_severe"} for i in sim_event_items(market, start, end) if i["type"] == "news"]
    return sim + items


# ---------------------------------------------------------------- delay statistics from our own data
@tracing.observe(name="tool_get_delay_stats")
def get_delay_stats(warehouse_id, as_of, modes=None):
    """Late share and average delay per shipping mode for orders that had been delivered before as_of (120-day window)."""
    d = dt.date.fromisoformat(as_of)
    lo, hi = (d - dt.timedelta(days=120)).isoformat(), (d - dt.timedelta(days=7)).isoformat()
    rows = fetch_all(data_client(), "orders",
                     "order_id,shipping_mode,days_for_shipping_real,days_for_shipment_scheduled,order_status", "order_id",
                     apply=lambda q: q.eq("warehouse_id", warehouse_id).gte("order_date", lo).lte("order_date", hi))
    stats = {}
    for m in (modes or ALL_MODES):
        xs = [(r["days_for_shipping_real"] - r["days_for_shipment_scheduled"]) for r in rows
              if r["shipping_mode"] == m and r["order_status"] not in EXCLUDED
              and r["days_for_shipping_real"] is not None and r["days_for_shipment_scheduled"] is not None]
        if xs:
            stats[m] = {"orders": len(xs), "late_share_pct": round(100 * sum(1 for x in xs if x > 0) / len(xs)),
                        "avg_delay_days": round(sum(xs) / len(xs), 1)}
    return stats


def delay_evidence(stats, as_of):
    if not stats:
        return [{"type": "data", "source": "RunOut orders table", "summary": "No comparable delivered orders found for this warehouse in the 120 days before the simulated date.",
                 "url": None, "timestamp": f"{as_of}T00:00:00Z"}]
    parts = [f"{m}: {v['late_share_pct']}% late, average {v['avg_delay_days']} days over plan ({v['orders']} orders)" for m, v in stats.items()]
    return [{"type": "data", "source": "RunOut orders table (120 days before the simulated date)",
             "summary": "Historical lateness at this warehouse. " + "; ".join(parts) + ".",
             "url": None, "timestamp": f"{as_of}T00:00:00Z"}]


if __name__ == "__main__":
    print("== weather, Europe, 2017-09-10 to 2017-09-20")
    for i in get_weather("Europe", "2017-09-10", "2017-09-20", "2017-09-20"):
        print("  ", {k: v for k, v in i.items() if k != "url"})
    print("== news, Europe")
    n = search_news("Europe", "2017-09-10", "2017-09-20", "2017-09-20")
    print("  ", len(n), "item(s)")
    for i in n:
        print("  ", i["timestamp"][:10], i["summary"][:140])