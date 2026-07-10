import { INTRADAY_CACHE_TTL_MS } from "../server/config.js";
import { getIntradayYieldData } from "../server/intradayClient.js";

let cachedValue = null;
let expiresAt = 0;

export default async function handler(_request, response) {
  response.setHeader("Cache-Control", "private, no-store");

  if (cachedValue && Date.now() < expiresAt) {
    return response.status(200).json({
      ...cachedValue,
      cache: { status: "hit", ttlSeconds: Math.round(INTRADAY_CACHE_TTL_MS / 1000) }
    });
  }

  try {
    const data = await getIntradayYieldData();
    cachedValue = data;
    expiresAt = Date.now() + INTRADAY_CACHE_TTL_MS;
    return response.status(200).json({
      ...data,
      cache: { status: "refresh", ttlSeconds: Math.round(INTRADAY_CACHE_TTL_MS / 1000) }
    });
  } catch (error) {
    if (cachedValue?.available) {
      return response.status(200).json({
        ...cachedValue,
        source: { ...cachedValue.source, status: "stale", retrievedAt: new Date().toISOString() },
        cache: {
          status: "stale",
          ttlSeconds: Math.round(INTRADAY_CACHE_TTL_MS / 1000),
          warning: "The intraday gateway is unavailable; the last validated quote snapshot is shown."
        }
      });
    }

    return response.status(503).json({
      error: "Intraday Treasury data unavailable",
      message: error instanceof Error ? error.message : "Unknown intraday gateway error"
    });
  }
}
