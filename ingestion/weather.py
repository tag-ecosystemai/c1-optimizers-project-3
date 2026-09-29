"""
RunOut — Weather Ingestion
Location: ingestion/weather.py

Pulls current weather + 7-day forecast from Open-Meteo for every
supplier location and seaport, writes one idempotent signal per
location into `signals`, and attaches the real seaport_id /
supplier_location_id so signals can be joined to shipments.

Open-Meteo needs no API key.

Usage:
    python ingestion/weather.py   (run from the repo root)
"""

import requests
from common.client import get_client
from common.db_writer import save_signal

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


def get_locations(sb):
    supplier = sb.table("supplier_locations").select("name,latitude,longitude,location_id").execute().data
    seaports = sb.table("seaports").select("name,latitude,longitude,seaport_id").execute().data
    locations = (
        [{**r, "kind": "supplier", "fk": r["location_id"]} for r in supplier]
        + [{**r, "kind": "seaport", "fk": r["seaport_id"]} for r in seaports]
    )
    if not locations:
        print("Warning: no locations found. Run the seed scripts first.")
    return locations


def fetch_weather(lat, lon):
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,precipitation,wind_speed_10m,weather_code",
        "daily": "precipitation_sum,wind_speed_10m_max,weather_code",
        "forecast_days": 7,
        "timezone": "UTC",
    }
    response = requests.get(OPEN_METEO_URL, params=params, timeout=15)
    response.raise_for_status()
    return response.json()


def run():
    sb = get_client()
    locations = get_locations(sb)

    saved, skipped, failed = 0, 0, 0
    for loc in locations:
        try:
            data = fetch_weather(float(loc["latitude"]), float(loc["longitude"]))
            result = save_signal(
                sb, "weather", "open-meteo", loc["name"], data,
                seaport_id=loc["fk"] if loc["kind"] == "seaport" else None,
                supplier_location_id=loc["fk"] if loc["kind"] == "supplier" else None,
            )
            if result == "skipped":
                skipped += 1
            else:
                saved += 1
                print(f"Ingested weather for {loc['name']}")
        except Exception as e:
            failed += 1
            print(f"Failed for {loc['name']}: {e}")

    print(f"Done. Saved: {saved}, Skipped (already today): {skipped}, Failed: {failed}")


if __name__ == "__main__":
    run()
