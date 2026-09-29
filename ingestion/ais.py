"""
RunOut — AIS Vessel Position Ingestion
Location: ingestion/ais.py

Connects to aisstream.io's free real-time AIS WebSocket and captures
live vessel positions on our real trade lanes.

IMPORTANT: the free tier is LIVE ONLY — there is no backfill. Run this
as early and often as possible (scheduled), since any window not
running is history that can never be recovered.

vessel_position rows are APPEND-ONLY (no daily dedupe) — we want the
position history.

Usage:
    python ingestion/ais.py   (run from the repo root)

Env:
    AISSTREAM_API_KEY, AIS_MAX_SAVED (default 200), AIS_DURATION_SECONDS (default 120)
"""

import os
import json
import asyncio
import websockets
from common.client import get_client
from common.db_writer import save_signal

AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream"

# Broad lane corridors. Format: [[min_lat, min_lon], [max_lat, max_lon]].
# Each box must NOT cross the antimeridian (min_lon < max_lon); the old
# box [[10,110],[50,-110]] was silently normalised to lon -110..110 and
# captured the Atlantic/Great Lakes instead of our Pacific lanes.
BOUNDING_BOXES = [
    [[0.0, 100.0], [50.0, 180.0]],     # Western Pacific: China / SE Asia origins
    [[0.0, -180.0], [50.0, -100.0]],   # Eastern Pacific: US west coast
    [[-10.0, -80.0], [55.0, 10.0]],    # Atlantic: Europe -> US east coast
]

MAX_SAVED = int(os.environ.get("AIS_MAX_SAVED", "200"))
DURATION_SECONDS = int(os.environ.get("AIS_DURATION_SECONDS", "120"))


async def listen(duration_seconds=DURATION_SECONDS):
    api_key = os.environ.get("AISSTREAM_API_KEY")
    if not api_key:
        raise RuntimeError("AISSTREAM_API_KEY not set — sign up free at aisstream.io")

    sb = get_client()
    subscribe_message = {
        "APIKey": api_key,
        "BoundingBoxes": BOUNDING_BOXES,
        "FilterMessageTypes": ["PositionReport"],
    }

    received, saved = 0, 0
    loop = asyncio.get_event_loop()

    async with websockets.connect(AISSTREAM_URL) as websocket:
        await websocket.send(json.dumps(subscribe_message))
        print("Connected to aisstream.io — listening for real vessel positions...")
        end_time = loop.time() + duration_seconds

        while loop.time() < end_time and saved < MAX_SAVED:
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=10)
                data = json.loads(message)
                received += 1
                if data.get("MessageType") == "PositionReport":
                    meta = data.get("MetaData", {})
                    key = meta.get("IMO") or meta.get("MMSI") or "unknown"
                    save_signal(sb, "vessel_position", "aisstream", str(key), data, dedupe=False)
                    saved += 1
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"Error processing message: {e}")

    print(f"Done. Messages received: {received}, Positions saved: {saved}")


if __name__ == "__main__":
    asyncio.run(listen())
