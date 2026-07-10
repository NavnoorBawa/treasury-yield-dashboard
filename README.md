# U.S. Treasury Yield Dashboard

A clean institutional-style dashboard for U.S. Treasury Constant Maturity rates. It displays current 2Y, 5Y, 10Y, and 30Y yields, daily moves in basis points and percent, six core curve spreads, date-to-date curve comparison, long-run macro research, a licensed-feed-ready on-the-run intraday workspace, and light/dark themes.

Live deployment: <https://treasury-yield-dashboard.vercel.app>

## Data Source

The backend reads the official U.S. Treasury XML feed for Daily Treasury Par Yield Curve Rates:

- Source page: <https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve>
- XML feed pattern: `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=YYYY`

No API key is required. The server fetches the current New York calendar year plus the prior year, normalizes the XML, computes daily changes against the previous Treasury observation, and caches the result for 10 minutes by default. The frontend refreshes automatically every 15 minutes while open.

Treasury CMTs are official end-of-day values. Treasury derives them from indicative bid-side quotations obtained by the Federal Reserve Bank of New York at or near 3:30 PM ET each business day, so no free official intraday CMT update exists. Faster polling would not make the underlying official curve fresher.

### Intraday Cash Treasury Layer

Intraday movement is a separate instrument and data layer. The dashboard never relabels interpolated daily CMT yields as live and never derives a cash yield from Treasury futures without the deliverable-basket and conversion-factor work required to do so correctly.

The `Intraday` workspace accepts a normalized, server-side feed of current on-the-run 2Y, 5Y, 10Y, and 30Y cash Treasury quotes. It shows bid, ask, midpoint/last, prior-close session change, yield-market width, timestamped session history, a single-maturity prior-close reference, New York time, and explicit live/delayed/stale status. Intraday yields use three-decimal precision; the official daily CMT view retains the source's two-decimal precision.

CME BrokerTec is the preferred institutional source because it is a central electronic cash Treasury venue and exposes on-the-run market data through licensed services. A direct browser connection is deliberately not included: BrokerTec access requires credentials and market-data/redistribution rights. The app instead connects to a server-side licensed gateway and keeps its token out of the frontend. With no authorized gateway configured, the dashboard displays an unavailable state rather than fabricated or scraped intraday values.

FRED was reviewed as a possible primary source because it is academically familiar and reliable. The app intentionally keeps Treasury as primary for current values because Treasury is the direct official publisher of the Daily Treasury Par Yield Curve Rates, while FRED republishes the relevant DGS series from the Federal Reserve/H.15 ecosystem and its official API requires an API key.

For long-run regime analysis, the app also uses the official Federal Reserve H.15 Data Download Program preformatted Treasury Constant Maturities CSV package:

- H.15 DDP page: <https://www.federalreserve.gov/datadownload/Choose.aspx?rel=H15>
- Direct CSV package: `https://www.federalreserve.gov/datadownload/Output.aspx?rel=H15&series=bf17364827e38702b42a58cf8eaa3f78&lastobs=&from=&to=&filetype=csv&label=include&layout=seriescolumn&type=package`

This gives reliable long-run daily history back to the earliest available H.15 observations, while Treasury XML supplements the newest current observation if Treasury has published a later record than H.15/FRED. See [DATA_SOURCE_DECISION.md](./DATA_SOURCE_DECISION.md) for the source comparison and freshness check.

## Research Features

- Long-run historical data for 2Y, 5Y, 10Y, and 30Y Treasury yields.
- Trader-style workspace tabs: Market, Intraday, Compare, History, and Regimes. Only the active research view is shown, avoiding the previous stacked-scroll layout.
- Date-range presets: 1Y, 5Y, 10Y, 20Y, Max, plus custom start/end dates.
- Six core 2Y/5Y/10Y/30Y curve combinations: 5Y-2Y, 10Y-2Y, 30Y-2Y, 10Y-5Y, 30Y-5Y, and 30Y-10Y.
- Date-to-date yield curve comparison with custom as-of/reference dates and 1W, 1M, 1Y, and range-start shortcuts.
- Macro event markers with focus actions that apply the event window and return directly to the rates/spreads view.
- A weekly or monthly color-coded curve-regime ribbon for each of the six segments. Classifications use non-overlapping completed calendar intervals, while the daily spread remains a separate line. The six classifications are bull steepening, bear steepening, bull flattening, bear flattening, parallel shift higher, and parallel shift lower. Near-parallel uses a disclosed 3 bps weekly or 5 bps monthly slope tolerance; open periods remain unclassified.
- Selected-range CSV export containing dates, 2Y/5Y/10Y/30Y yields, and all six core curve spreads.
- Selected-period statistics: latest, min, max, average, annualized daily-change volatility, 1M/3M/1Y changes, empirical percentile rank, and observation count. Momentum changes use the nearest valid observation on or before the calendar lookback even when it predates the visible range.
- Light and dark themes for presentation use.

Historical charts use observed business-day data only. Weekends, federal market holidays, and source-level `ND` observations are not imputed. Treasury stopped issuing the 30Y on February 18, 2002 and resumed publication of the observed 30Y CMT on February 9, 2006; the dashboard explicitly preserves February 18, 2002 through February 8, 2006 as unavailable rather than treating H.15's interim estimated values as observed 30Y quotations. Dependent 30Y spreads are consequently unavailable for that interval. A methodology marker identifies Treasury's December 6, 2021 shift from quasi-cubic Hermite to monotone-convex curve construction; both regimes remain official, but long-run comparisons should recognize the change.

## Quick Start

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` requests to the Express backend on port `4174`.

## Production Run

```bash
npm run build
npm start
```

Open <http://localhost:4174>. In production, Express serves both `/api/yields` and the built frontend from `dist/`.

## Scripts

- `npm run dev`: start Vite and Express together.
- `npm run build`: type-check and create the production frontend bundle.
- `npm start`: run the production Express server.
- `npm run preview`: preview only the Vite build.
- `npm run verify:data`: fetch official sources and assert current values, history coverage, latest-source merge, and spread calculations.
- `npm run verify:intraday`: validate the intraday contract, quote precision, prior-close bps calculations, market width, maturity completeness, timestamp ordering, and malformed-feed rejection.

## Configuration

Optional environment variables:

- `PORT`: production/server port. Default: `4174`.
- `CACHE_TTL_MS`: backend Treasury data cache duration. Default: `600000`.
- `HISTORY_WINDOW_DAYS`: lookback window for historical charts. Default: `365`.
- `HISTORY_CACHE_TTL_MS`: long-run H.15 cache duration. Default: `1800000`.
- `INTRADAY_GATEWAY_URL`: HTTPS URL of a redistribution-authorized gateway. Localhost HTTP is accepted for development only.
- `INTRADAY_GATEWAY_TOKEN`: optional bearer token sent only by the Node API.
- `INTRADAY_PROVIDER_NAME`: licensed provider name shown in the source status.
- `INTRADAY_VENUE`: venue shown in the source status.
- `INTRADAY_DELAY_MINUTES`: minimum disclosed delay; the API uses the greater of this value and the gateway-provided delay.
- `INTRADAY_REFRESH_INTERVAL_SECONDS`: browser polling interval, with a hard minimum of five seconds. Default: `15`.
- `INTRADAY_CACHE_TTL_MS`: private server snapshot cache. Default: `5000`.

Copy `.env.example` to `.env` for local intraday configuration. `.env*` files are ignored except for the non-secret example.

## API

`GET /api/yields`

Returns:

- `summary`: current 2Y, 5Y, 10Y, and 30Y yields plus prior observation, daily bps change, and daily percent change.
- `curve`: latest official curve points.
- `history`: one-year historical series for each dashboard maturity.
- `spreads`: all six current 2Y/5Y/10Y/30Y curve spreads with daily basis-point changes.
- `source`: Treasury source links, latest official record date, previous record date, feed timestamp, and retrieval timestamp.
- `cache`: cache status (`hit`, `refresh`, or `stale`).

`GET /api/history`

Returns:

- `rows`: long-run H.15 daily Treasury constant maturity observations for 2Y, 5Y, 10Y, and 30Y, plus computed fields for all six pairwise curve spreads.
- `maturities`: maturity metadata used by the research charts.
- `spreads`: spread definitions.
- `availability`: first/last valid dates and observation counts by maturity.
- `source`: H.15 source metadata, Treasury supplement status, and limitations note.
- `cache`: cache status.

`GET /api/intraday`

Returns a normalized on-the-run cash Treasury snapshot. With no licensed gateway configured it returns HTTP 200 with `available: false`, no quotes, and no series. A configured gateway must return:

```json
{
  "source": {
    "asOf": "2026-07-10T14:30:03.000Z",
    "sessionDate": "2026-07-10",
    "delayMinutes": 0
  },
  "quotes": [
    {
      "key": "2Y",
      "cusip": "91282XXXX",
      "bidYield": 4.162,
      "askYield": 4.158,
      "lastYield": 4.160,
      "priorCloseYield": 4.200,
      "quoteTimestamp": "2026-07-10T14:30:03.000Z"
    }
  ],
  "series": [
    {
      "timestamp": "2026-07-10T14:30:00.000Z",
      "2Y": 4.160,
      "5Y": 4.270,
      "10Y": 4.540,
      "30Y": 5.050
    }
  ]
}
```

`quotes` must contain exactly one entry for each of `2Y`, `5Y`, `10Y`, and `30Y`; the shortened example shows one entry only for readability. The server validates supported tenors, yield bounds, CUSIP shape, timestamps, response size, and row count. It independently computes midpoints, basis-point session changes, and absolute bid/ask yield width instead of trusting gateway calculations.

## Project Structure

```text
server/
  cache.js              In-memory cache
  config.js             Source URLs, maturity definitions, runtime config
  historicalClient.js   Federal Reserve H.15 DDP CSV fetch/parse/normalize logic
  intradayClient.js     Licensed gateway fetch, validation, and quote normalization
  index.js              Express app, API routes, production static serving
  treasuryClient.js     Treasury XML fetch/parse/normalize logic
src/
  components/           Tabbed workspace, current/intraday curves, comparison, charts, and regime timeline
  hooks/                Data refresh and theme hooks
  lib/                  Formatting, event, range, and statistics utilities
  styles/               Theme tokens and responsive layout
  types.ts              Shared frontend data contracts
```

## Deployment

The current recommended deployment target is Vercel because it supports the Vite frontend plus Node serverless API routes on the free Hobby plan without Render-style idle spin-down.

This project includes:

- `api/health.js`
- `api/yields.js`
- `api/history.js`
- `api/intraday.js`
- `vercel.json`
- `public/robots.txt`, `public/sitemap.xml`, and `public/404.html`

Security headers are configured in `vercel.json` for Vercel and through Helmet for the local Express production server. The official daily and historical views have no required secrets or API keys. Intraday values require optional licensed-gateway environment variables and valid redistribution rights.

Deploy with:

```bash
npx vercel --prod
```

Production URL:

```text
https://treasury-yield-dashboard.vercel.app
```

You can also use any Node 22 host that can run an Express server.

Recommended settings for Render, Railway, Fly.io, or similar:

- Build command: `npm ci && npm run build`
- Start command: `npm start`
- Health check: `/api/health`
- Required secrets for official daily/history views: none
- Optional intraday secret: `INTRADAY_GATEWAY_TOKEN`

For static-only hosts, keep the backend deployed separately and point the frontend to that API, or use a platform function to proxy Treasury XML requests. The included one-service Express setup is the simplest deployment path.
