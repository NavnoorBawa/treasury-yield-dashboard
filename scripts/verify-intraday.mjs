import assert from "node:assert/strict";
import { normalizeIntradayPayload } from "../server/intradayClient.js";

const asOf = new Date(Date.now() - 60 * 1000);
const earlier = new Date(asOf.getTime() - 60 * 60 * 1000);
const fixture = {
  source: {
    asOf: asOf.toISOString(),
    sessionDate: "2026-07-10",
    delayMinutes: 0
  },
  quotes: [
    { key: "2Y", cusip: "91282AAA1", bidYield: 4.161, askYield: 4.159, lastYield: 4.16, priorCloseYield: 4.2, quoteTimestamp: new Date(asOf.getTime() - 3000).toISOString() },
    { key: "5Y", cusip: "91282AAB9", bidYield: 4.272, askYield: 4.268, lastYield: 4.27, priorCloseYield: 4.29, quoteTimestamp: new Date(asOf.getTime() - 2000).toISOString() },
    { key: "10Y", cusip: "91282AAC7", bidYield: 4.543, askYield: 4.537, lastYield: 4.54, priorCloseYield: 4.53, quoteTimestamp: new Date(asOf.getTime() - 1000).toISOString() },
    { key: "30Y", cusip: "912810AAA", bidYield: 5.054, askYield: 5.046, lastYield: 5.05, priorCloseYield: 5.07, quoteTimestamp: asOf.toISOString() }
  ],
  series: [
    { timestamp: asOf.toISOString(), "2Y": 4.16, "5Y": 4.27, "10Y": 4.54, "30Y": 5.05 },
    { timestamp: earlier.toISOString(), "2Y": 4.18, "5Y": 4.28, "10Y": 4.52, "30Y": 5.06 },
    { timestamp: asOf.toISOString(), "2Y": 4.159, "5Y": 4.269, "10Y": 4.539, "30Y": 5.049 }
  ]
};

const normalized = normalizeIntradayPayload(fixture);
assert.equal(normalized.available, true);
assert.equal(normalized.quotes.length, 4);
assert.deepEqual(normalized.quotes.map(({ key }) => key), ["2Y", "5Y", "10Y", "30Y"]);

const quotes = Object.fromEntries(normalized.quotes.map((quote) => [quote.key, quote]));
assert.equal(quotes["2Y"].midYield, 4.16, "2Y midpoint should average the two-sided yield quote");
assert.equal(quotes["2Y"].sessionChangeBps, -4, "2Y session move should equal (mid - prior close) * 100");
assert.equal(quotes["5Y"].sessionChangeBps, -2, "5Y session move should equal (mid - prior close) * 100");
assert.equal(quotes["10Y"].sessionChangeBps, 1, "10Y session move should equal (mid - prior close) * 100");
assert.equal(quotes["30Y"].sessionChangeBps, -2, "30Y session move should equal (mid - prior close) * 100");
assert.equal(quotes["10Y"].bidAskSpreadBps, 0.6, "Yield bid/ask spread should use the absolute difference in bps");

assert.equal(normalized.series.length, 2, "Duplicate timestamps should retain one validated observation");
assert.equal(normalized.series[0].timestamp, earlier.toISOString(), "Series should be ascending by timestamp");
assert.equal(normalized.series[1]["10Y"], 4.539, "The latest duplicate timestamp should win");
assert.equal(normalized.source.asOf, asOf.toISOString(), "Source as-of should reflect the newest validated quote");
assert.equal(normalized.source.sessionDate, "2026-07-10");

assert.throws(
  () => normalizeIntradayPayload({ ...fixture, quotes: [...fixture.quotes, fixture.quotes[0]] }),
  /exactly one quote/,
  "Duplicate maturity quotes must be rejected"
);

assert.throws(
  () => normalizeIntradayPayload({ ...fixture, source: { ...fixture.source, asOf: new Date(Date.now() + 10 * 60 * 1000).toISOString() } }),
  /five minutes in the future/,
  "Materially future-dated feed timestamps must be rejected"
);

assert.throws(
  () => normalizeIntradayPayload({ ...fixture, quotes: fixture.quotes.slice(0, 3) }),
  /missing: 30Y/,
  "Incomplete maturity sets must be rejected"
);

console.log(JSON.stringify({
  status: "ok",
  maturities: normalized.quotes.map(({ key, midYield, sessionChangeBps, bidAskSpreadBps }) => ({ key, midYield, sessionChangeBps, bidAskSpreadBps })),
  seriesRows: normalized.series.length,
  asOf: normalized.source.asOf
}, null, 2));
