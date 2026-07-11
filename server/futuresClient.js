import {
  FUTURES_RANGES,
  FUTURES_SOURCE,
  TREASURY_FUTURES
} from "./config.js";

const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const round = (value, decimals) => Number(value.toFixed(decimals));

export const normalizeFuturesRange = (value) => {
  const normalized = typeof value === "string" ? value.toUpperCase() : "1D";
  return Object.hasOwn(FUTURES_RANGES, normalized) ? normalized : "1D";
};

const extractEmbeddedSpark = (html, symbol) => {
  const scriptPattern = /<script\b[^>]*type="application\/json"[^>]*data-sveltekit-fetched[^>]*>([\s\S]*?)<\/script>/g;

  for (const match of html.matchAll(scriptPattern)) {
    try {
      const wrapper = JSON.parse(match[1]);
      if (typeof wrapper?.body !== "string") continue;
      const body = JSON.parse(wrapper.body);
      const result = body?.spark?.result?.find((item) => item.symbol === symbol);
      if (result?.response?.[0]) return result;
    } catch {
      // Yahoo pages contain multiple unrelated JSON payloads. Ignore non-spark blocks.
    }
  }

  throw new Error(`${symbol} quote page did not contain an embedded chart`);
};

const fetchQuotePageFallback = async () => {
  const settled = await Promise.allSettled(TREASURY_FUTURES.map(async (instrument) => {
    const response = await fetch(instrument.yahooPageUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": USER_AGENT
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`${instrument.symbol} page returned HTTP ${response.status}`);
    return extractEmbeddedSpark(await response.text(), instrument.symbol);
  }));

  const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (!results.length) {
    const reasons = settled.flatMap((result) => result.status === "rejected"
      ? [result.reason instanceof Error ? result.reason.message : "quote page failed"]
      : []);
    throw new Error(`Yahoo quote-page fallback failed (${reasons.join("; ")})`);
  }

  return { spark: { result: results, error: null } };
};

const fetchSparkPayload = async (rangeKey) => {
  const range = FUTURES_RANGES[rangeKey];
  const symbols = TREASURY_FUTURES.map((instrument) => instrument.symbol).join(",");
  const query = new URLSearchParams({
    symbols,
    range: range.providerRange,
    interval: range.providerInterval,
    includePrePost: "true"
  });
  const errors = [];

  for (const host of YAHOO_HOSTS) {
    try {
      const response = await fetch(`https://${host}/v7/finance/spark?${query}`, {
        headers: {
          Accept: "application/json,text/plain,*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": USER_AGENT
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      if (payload?.spark?.error || !Array.isArray(payload?.spark?.result)) {
        throw new Error(payload?.spark?.error?.description ?? "Unexpected Yahoo Finance response");
      }

      return { payload, actualRange: rangeKey, warnings: [] };
    } catch (error) {
      errors.push(`${host}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  try {
    const payload = await fetchQuotePageFallback();
    return {
      payload,
      actualRange: "1D",
      warnings: [
        "Yahoo chart API was unavailable or rate-limited; showing the embedded 24-hour quote-page series instead."
      ]
    };
  } catch (fallbackError) {
    throw new Error(
      `Delayed Treasury-futures feed unavailable (${errors.join("; ")}; ${fallbackError instanceof Error ? fallbackError.message : "fallback failed"})`
    );
  }
};

const normalizeSeries = (chart) => {
  const timestamps = Array.isArray(chart?.timestamp) ? chart.timestamp : [];
  const closes = Array.isArray(chart?.indicators?.quote?.[0]?.close)
    ? chart.indicators.quote[0].close
    : [];
  const deduplicated = new Map();

  for (let index = 0; index < Math.min(timestamps.length, closes.length); index += 1) {
    const timestampSeconds = timestamps[index];
    const price = closes[index];
    if (!isFiniteNumber(timestampSeconds) || !isFiniteNumber(price)) continue;
    deduplicated.set(timestampSeconds, {
      timestamp: timestampSeconds * 1000,
      price
    });
  }

  return [...deduplicated.values()].sort((left, right) => left.timestamp - right.timestamp);
};

const normalizeInstrument = (definition, result) => {
  const chart = result?.response?.[0];
  const meta = chart?.meta;
  if (!meta || meta.symbol !== definition.symbol || meta.instrumentType !== "FUTURE") {
    throw new Error(`${definition.symbol} did not return a valid futures quote`);
  }

  const series = normalizeSeries(chart);
  const latestSeriesPrice = series.at(-1)?.price;
  const price = isFiniteNumber(meta.regularMarketPrice) ? meta.regularMarketPrice : latestSeriesPrice;
  const previousClose = isFiniteNumber(meta.previousClose) ? meta.previousClose : meta.chartPreviousClose;
  if (!isFiniteNumber(price) || !isFiniteNumber(previousClose) || previousClose <= 0) {
    throw new Error(`${definition.symbol} is missing a valid price or previous close`);
  }

  const priceChange = round(Math.round((price - previousClose) / definition.minTick) * definition.minTick, 8);
  const priceChangePct = round((priceChange / previousClose) * 100, 6);
  const currentPeriod = meta.currentTradingPeriod?.regular;
  const nowSeconds = Date.now() / 1000;
  const marketState = isFiniteNumber(currentPeriod?.start) && isFiniteNumber(currentPeriod?.end)
    && nowSeconds >= currentPeriod.start && nowSeconds <= currentPeriod.end
    ? "open"
    : "closed";

  return {
    ...definition,
    contractName: typeof meta.shortName === "string" ? meta.shortName : `${definition.label} Futures`,
    exchange: typeof meta.fullExchangeName === "string" ? meta.fullExchangeName : FUTURES_SOURCE.exchange,
    currency: typeof meta.currency === "string" ? meta.currency : "USD",
    price,
    previousClose,
    priceChange,
    priceChangePct,
    changeThirtySeconds: round(priceChange * 32, 4),
    dayHigh: isFiniteNumber(meta.regularMarketDayHigh) ? meta.regularMarketDayHigh : null,
    dayLow: isFiniteNumber(meta.regularMarketDayLow) ? meta.regularMarketDayLow : null,
    volume: isFiniteNumber(meta.regularMarketVolume) ? meta.regularMarketVolume : null,
    quoteTime: isFiniteNumber(meta.regularMarketTime)
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : series.at(-1)
        ? new Date(series.at(-1).timestamp).toISOString()
        : null,
    marketState,
    rateDirection: priceChange > 0 ? "lower" : priceChange < 0 ? "higher" : "unchanged",
    series
  };
};

export const normalizeFuturesPayload = (payload, requestedRange = "1D") => {
  const rangeKey = normalizeFuturesRange(requestedRange);
  const resultBySymbol = new Map(
    (payload?.spark?.result ?? []).map((result) => [result.symbol, result])
  );
  const instruments = [];
  const warnings = [];

  for (const definition of TREASURY_FUTURES) {
    try {
      instruments.push(normalizeInstrument(definition, resultBySymbol.get(definition.symbol)));
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `${definition.symbol} is unavailable`);
    }
  }

  if (!instruments.length) {
    throw new Error(`No valid Treasury-futures instruments were returned. ${warnings.join(" ")}`);
  }

  return {
    source: {
      ...FUTURES_SOURCE,
      retrievedAt: new Date().toISOString(),
      delayed: true,
      displayUse: "Indicative intraday market reference only"
    },
    range: {
      key: rangeKey,
      ...FUTURES_RANGES[rangeKey]
    },
    instruments,
    warnings
  };
};

export const getTreasuryFuturesData = async (requestedRange = "1D") => {
  const rangeKey = normalizeFuturesRange(requestedRange);
  const result = await fetchSparkPayload(rangeKey);
  const normalized = normalizeFuturesPayload(result.payload, result.actualRange);
  return {
    ...normalized,
    warnings: [...result.warnings, ...normalized.warnings]
  };
};
