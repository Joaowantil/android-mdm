import httpx

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"


async def reverse_geocode(latitude: float, longitude: float) -> str | None:
    """Best-effort reverse geocoding via OpenStreetMap Nominatim.

    Returns a human-readable address or ``None`` if the lookup fails (no
    internet, rate limited, etc.). Never raises.
    """
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                NOMINATIM_URL,
                params={
                    "lat": latitude,
                    "lon": longitude,
                    "format": "jsonv2",
                    "zoom": 18,
                    "addressdetails": 0,
                    "accept-language": "pt-BR",
                },
                headers={"User-Agent": "android-mdm/1.0 (device-locator)"},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            return data.get("display_name")
    except Exception:
        return None
