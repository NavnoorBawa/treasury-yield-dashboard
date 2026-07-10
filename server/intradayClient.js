import {
  DASHBOARD_MATURITIES,
  INTRADAY_DELAY_MINUTES,
  INTRADAY_GATEWAY_TOKEN,
  INTRADAY_GATEWAY_URL,
  INTRADAY_PROVIDER_NAME,
  INTRADAY_REFRESH_INTERVAL_SECONDS,
  INTRADAY_VENUE
} from "./config.js";

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_SERIES_ROWS = 5000;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MIN_YIELD = -5;
const MAX_YIELD = 25;
const MATURITY_KEYS = DASHBOARD_MATURITIES.map(({ key }) => key);
const MATURITY_KEY_SET = new Set(MATURITY_KEYS);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const toNullableYield = (value, field) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < MIN_YIELD || numeric > MAX_YIELD) {
    throw new Error(`${field} must be a finite percentage yield between ${MIN_YIELD}% and ${MAX_YIELD}%`);
  }
  return Math.round(numeric * 100000) / 100000;
};

const toTimestamp = (value, field) => {
  const timestamp = new Date(value);
  if (!value || Number.isNaN(timestamp.getTime())) {
    throw new Error(`${field} must be a valid ISO timestamp`);
  }
  if (timestamp.getTime() > Date.now() + MAX_FUTURE_CLOCK_SKEW_MS) {
    throw new Error(`${field} is more than five minutes in the future`);
  }
  return timestamp.toISOString();
};

const toSessionDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
};

const newYorkDate = (timestamp) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "America/New_York"
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const roundBps = (value) => Math.round(value * 10) / 10;

const normalizeQuote = (rawQuote, fallbackTimestamp) => {
  if (!isRecord(rawQuote) || !MATURITY_KEY_SET.has(rawQuote.key)) {
    throw new Error("Every intraday quote must contain one supported maturity key");
  }

  const maturity = DASHBOARD_MATURITIES.find(({ key }) => key === rawQuote.key);
  const bidYield = toNullableYield(rawQuote.bidYield, `${rawQuote.key} bidYield`);
  const askYield = toNullableYield(rawQuote.askYield, `${rawQuote.key} askYield`);
  const lastYield = toNullableYield(rawQuote.lastYield, `${rawQuote.key} lastYield`);
  const suppliedMid = toNullableYield(rawQuote.midYield, `${rawQuote.key} midYield`);
  const midYield = suppliedMid ?? (bidYield !== null && askYield !== null ? (bidYield + askYield) / 2 : null);
  const priorCloseYield = toNullableYield(rawQuote.priorCloseYield, `${rawQuote.key} priorCloseYield`);
  const markYield = midYield ?? lastYield;

  if (markYield === null) {
    throw new Error(`${rawQuote.key} requires a bid/ask midpoint or last traded yield`);
  }

  return {
    key: rawQuote.key,
    label: maturity.label,
    cusip: typeof rawQuote.cusip === "string" && /^[0-9A-Z]{9}$/.test(rawQuote.cusip) ? rawQuote.cusip : null,
    bidYield,
    askYield,
    lastYield,
    midYield: midYield === null ? null : Math.round(midYield * 100000) / 100000,
    priorCloseYield,
    sessionChangeBps: priorCloseYield === null ? null : roundBps((markYield - priorCloseYield) * 100),
    bidAskSpreadBps:
      bidYield === null || askYield === null ? null : roundBps(Math.abs(askYield - bidYield) * 100),
    quoteTimestamp: toTimestamp(rawQuote.quoteTimestamp ?? fallbackTimestamp, `${rawQuote.key} quoteTimestamp`)
  };
};

const normalizeSeries = (rawSeries) => {
  if (rawSeries === undefined || rawSeries === null) return [];
  if (!Array.isArray(rawSeries)) throw new Error("Intraday series must be an array");
  if (rawSeries.length > MAX_SERIES_ROWS) {
    throw new Error(`Intraday series exceeds the ${MAX_SERIES_ROWS.toLocaleString()} row limit`);
  }

  const byTimestamp = new Map();
  rawSeries.forEach((rawRow, index) => {
    if (!isRecord(rawRow)) throw new Error(`Intraday series row ${index + 1} must be an object`);
    const timestamp = toTimestamp(rawRow.timestamp, `Intraday series row ${index + 1} timestamp`);
    const row = { timestamp };
    let hasValue = false;

    MATURITY_KEYS.forEach((key) => {
      const value = toNullableYield(rawRow[key], `Intraday series row ${index + 1} ${key}`);
      row[key] = value;
      hasValue ||= value !== null;
    });

    if (hasValue) byTimestamp.set(timestamp, row);
  });

  return [...byTimestamp.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
};

const getDelayMinutes = (rawDelay) => {
  const configured = Number.isFinite(INTRADAY_DELAY_MINUTES) ? Math.max(0, INTRADAY_DELAY_MINUTES) : 0;
  const supplied = Number(rawDelay);
  return Number.isFinite(supplied) ? Math.max(configured, supplied, 0) : configured;
};

export const getUnavailableIntradayData = () => ({
  available: false,
  source: {
    status: "unavailable",
    name: "Not configured",
    venue: "U.S. Treasury cash market",
    instrumentType: "On-the-run nominal U.S. Treasury securities",
    sessionDate: null,
    asOf: null,
    retrievedAt: new Date().toISOString(),
    delayMinutes: null,
    refreshIntervalSeconds: INTRADAY_REFRESH_INTERVAL_SECONDS,
    reason: "A redistribution-authorized intraday cash Treasury feed has not been configured."
  },
  quotes: [],
  series: []
});

export const normalizeIntradayPayload = (rawPayload) => {
  if (!isRecord(rawPayload)) throw new Error("Intraday gateway response must be a JSON object");
  const rawSource = isRecord(rawPayload.source) ? rawPayload.source : {};
  const rawAsOf = rawSource.asOf ?? rawPayload.asOf;
  const fallbackTimestamp = toTimestamp(rawAsOf, "Intraday source asOf");

  if (!Array.isArray(rawPayload.quotes)) throw new Error("Intraday gateway response requires a quotes array");
  const quotes = rawPayload.quotes.map((quote) => normalizeQuote(quote, fallbackTimestamp));
  const quoteByKey = new Map(quotes.map((quote) => [quote.key, quote]));
  const missingKeys = MATURITY_KEYS.filter((key) => !quoteByKey.has(key));
  if (missingKeys.length || quoteByKey.size !== MATURITY_KEYS.length || quotes.length !== MATURITY_KEYS.length) {
    throw new Error(`Intraday quotes must contain exactly one quote for 2Y, 5Y, 10Y, and 30Y; missing: ${missingKeys.join(", ") || "none"}`);
  }

  const orderedQuotes = MATURITY_KEYS.map((key) => quoteByKey.get(key));
  const series = normalizeSeries(rawPayload.series);
  const latestTimestamp = [
    fallbackTimestamp,
    ...orderedQuotes.map(({ quoteTimestamp }) => quoteTimestamp),
    ...series.slice(-1).map(({ timestamp }) => timestamp)
  ].sort().at(-1);
  const delayMinutes = getDelayMinutes(rawSource.delayMinutes ?? rawPayload.delayMinutes);

  return {
    available: true,
    source: {
      status: delayMinutes > 0 ? "delayed" : "live",
      name: INTRADAY_PROVIDER_NAME,
      venue: INTRADAY_VENUE,
      instrumentType: "On-the-run nominal U.S. Treasury securities",
      sessionDate: toSessionDate(rawSource.sessionDate ?? rawPayload.sessionDate) ?? newYorkDate(latestTimestamp),
      asOf: latestTimestamp,
      retrievedAt: new Date().toISOString(),
      delayMinutes,
      refreshIntervalSeconds: INTRADAY_REFRESH_INTERVAL_SECONDS
    },
    quotes: orderedQuotes,
    series
  };
};

const validateGatewayUrl = () => {
  const url = new URL(INTRADAY_GATEWAY_URL);
  const isLocalDevelopment = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalDevelopment)) {
    throw new Error("INTRADAY_GATEWAY_URL must use HTTPS outside local development");
  }
  return url;
};

export const getIntradayYieldData = async () => {
  if (!INTRADAY_GATEWAY_URL) return getUnavailableIntradayData();

  const url = validateGatewayUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ...(INTRADAY_GATEWAY_TOKEN ? { Authorization: `Bearer ${INTRADAY_GATEWAY_TOKEN}` } : {})
      },
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Intraday gateway returned HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error("Intraday gateway must return application/json");
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      throw new Error("Intraday gateway response is too large");
    }

    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
      throw new Error("Intraday gateway response is too large");
    }

    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("Intraday gateway returned invalid JSON");
    }
    return normalizeIntradayPayload(payload);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Intraday gateway timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds`);
    }
    if (error instanceof Error && error.message === "fetch failed" && error.cause instanceof Error) {
      throw new Error(`Intraday gateway request failed: ${error.cause.message}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};
