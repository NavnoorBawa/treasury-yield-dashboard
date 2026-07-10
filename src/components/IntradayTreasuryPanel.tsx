import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus, Radio, RefreshCw } from "lucide-react";
import { useIntradayTreasury } from "../hooks/useIntradayTreasury";
import { formatBps, formatDate, formatTimestamp } from "../lib/format";
import type { IntradayMaturityKey, IntradayQuote } from "../types";
import { LoadingBlock } from "./LoadingBlock";

type ChartSelection = "ALL" | IntradayMaturityKey;

const maturityKeys: IntradayMaturityKey[] = ["2Y", "5Y", "10Y", "30Y"];

const colors: Record<IntradayMaturityKey, string> = {
  "2Y": "var(--series-2y)",
  "5Y": "var(--series-5y)",
  "10Y": "var(--series-10y)",
  "30Y": "var(--series-30y)"
};

const formatIntradayYield = (value?: number | null) =>
  value === null || value === undefined || Number.isNaN(value) ? "n/a" : `${value.toFixed(3)}%`;

const formatMarketWidth = (value?: number | null) =>
  value === null || value === undefined || Number.isNaN(value) ? "n/a" : `${value.toFixed(1)} bps`;

const formatNewYorkTime = (timestamp?: string | null, includeSeconds = false) => {
  if (!timestamp) return "n/a";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
    timeZone: "America/New_York",
    timeZoneName: includeSeconds ? "short" : undefined
  }).format(new Date(timestamp));
};

const getMarkYield = (quote: IntradayQuote) => quote.midYield ?? quote.lastYield;

const getStatusLabel = (status: "live" | "delayed" | "stale" | "unavailable", delayMinutes: number | null) => {
  if (status === "live") return "Real-time feed";
  if (status === "delayed") return `${delayMinutes ?? 0} min delayed`;
  if (status === "stale") return "Stale";
  return "Not connected";
};

interface IntradayTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{
    dataKey?: string;
    name?: string;
    value?: number | null;
    color?: string;
  }>;
}

function IntradayTooltip({ active, label, payload }: IntradayTooltipProps) {
  if (!active || !payload?.some(({ value }) => typeof value === "number")) return null;

  return (
    <div className="chart-tooltip chart-tooltip--wide">
      <span className="chart-tooltip__label">{formatNewYorkTime(label, true)}</span>
      <div className="chart-tooltip__rows">
        {payload
          .filter(({ value }) => typeof value === "number")
          .map((item) => (
            <div className="chart-tooltip__row" key={item.dataKey}>
              <span><i style={{ backgroundColor: item.color }} />{item.name ?? item.dataKey}</span>
              <strong>{formatIntradayYield(item.value)}</strong>
            </div>
          ))}
      </div>
    </div>
  );
}

function QuoteCard({ quote }: { quote: IntradayQuote }) {
  const markYield = getMarkYield(quote);
  const move = quote.sessionChangeBps;
  const direction = move === null || move === 0 ? "flat" : move > 0 ? "up" : "down";
  const DirectionIcon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;

  return (
    <article className={`intraday-quote intraday-quote--${quote.key.toLowerCase()}`}>
      <div className="intraday-quote__topline">
        <strong>{quote.key} OTR</strong>
        <span>{quote.cusip ?? quote.label}</span>
      </div>
      <div className="intraday-quote__mark">
        <strong>{formatIntradayYield(markYield)}</strong>
        <span>{quote.midYield !== null ? "Mid" : "Last"}</span>
      </div>
      <div className={`intraday-quote__move intraday-quote__move--${direction}`}>
        <DirectionIcon size={15} aria-hidden="true" />
        <strong>{formatBps(move)}</strong>
        <span>vs prior close</span>
      </div>
      <dl className="intraday-quote__market">
        <div><dt>Bid yield</dt><dd>{formatIntradayYield(quote.bidYield)}</dd></div>
        <div><dt>Ask yield</dt><dd>{formatIntradayYield(quote.askYield)}</dd></div>
        <div><dt>Yld spread</dt><dd>{formatMarketWidth(quote.bidAskSpreadBps)}</dd></div>
      </dl>
      <small>{formatNewYorkTime(quote.quoteTimestamp, true)}</small>
    </article>
  );
}

interface IntradayTreasuryPanelProps {
  onShowDaily: () => void;
}

export function IntradayTreasuryPanel({ onShowDaily }: IntradayTreasuryPanelProps) {
  const [selection, setSelection] = useState<ChartSelection>("ALL");
  const { data, error, isFetching, isLoading, refetch } = useIntradayTreasury();
  const selectedKeys = selection === "ALL" ? maturityKeys : [selection];
  const selectedPriorClose = useMemo(() => {
    if (selection === "ALL") return null;
    return data?.quotes.find(({ key }) => key === selection)?.priorCloseYield ?? null;
  }, [data?.quotes, selection]);

  if (isLoading && !data) {
    return <LoadingBlock className="panel intraday-loading" rows={7} />;
  }

  if (error && !data) {
    return (
      <section className="notice" role="alert">
        <div><strong>Intraday gateway unavailable.</strong><span>{error instanceof Error ? error.message : "The feed could not be reached."}</span></div>
        <button className="text-button" type="button" onClick={() => refetch()}><RefreshCw size={15} aria-hidden="true" />Retry</button>
      </section>
    );
  }

  if (!data?.available) {
    return (
      <article className="panel intraday-empty">
        <div className="intraday-empty__icon"><Radio size={21} aria-hidden="true" /></div>
        <div>
          <p className="eyebrow">On-the-run cash Treasuries</p>
          <h2>Licensed intraday feed not connected</h2>
          <p>The official CMT curve is a daily fixing. This view requires a redistribution-authorized 2Y, 5Y, 10Y, and 30Y cash Treasury feed and intentionally shows no estimated, scraped, or futures-derived yields.</p>
        </div>
        <dl className="intraday-empty__requirements">
          <div><dt>Preferred source</dt><dd>CME BrokerTec or an authorized vendor</dd></div>
          <div><dt>Instrument</dt><dd>Current on-the-run nominal securities</dd></div>
          <div><dt>Required fields</dt><dd>Bid, ask, last, prior close, and timestamped session marks</dd></div>
        </dl>
        <button className="text-button" type="button" onClick={onShowDaily}>View official daily CMT</button>
      </article>
    );
  }

  const statusLabel = getStatusLabel(data.source.status, data.source.delayMinutes);
  const hasChartData = data.series.length >= 2;

  return (
    <div className="intraday-workspace">
      {data.cache.warning ? <div className="notice notice--warning" role="status"><strong>Last validated snapshot.</strong><span>{data.cache.warning}</span></div> : null}
      <div className="intraday-heading">
        <div>
          <p className="eyebrow">U.S. Treasury cash session</p>
          <h2>On-the-Run Intraday Yields</h2>
          <p>Two-sided cash-market yield marks and session moves, kept separate from the official daily CMT fixing.</p>
        </div>
        <div className="intraday-source">
          <span className={`intraday-status intraday-status--${data.source.status}`}><i />{statusLabel}</span>
          <strong>{data.source.name} · {data.source.venue}</strong>
          <small>As of {formatTimestamp(data.source.asOf)}</small>
        </div>
      </div>

      <div className="intraday-quote-grid" aria-label="Current on-the-run Treasury quotes">
        {data.quotes.map((quote) => <QuoteCard key={quote.key} quote={quote} />)}
      </div>

      <article className="panel intraday-chart-panel">
        <div className="panel__header intraday-chart-header">
          <div>
            <p className="eyebrow">Session history</p>
            <h3>{selection === "ALL" ? "2Y, 5Y, 10Y, and 30Y yield marks" : `${selection} on-the-run yield`}</h3>
          </div>
          <div className="intraday-chart-meta">
            <span>{data.source.sessionDate ? `Session ${formatDate(data.source.sessionDate)}` : "Current session"}</span>
            <div className="spread-selector" aria-label="Intraday chart maturity">
              {(["ALL", ...maturityKeys] as ChartSelection[]).map((key) => (
                <button className={selection === key ? "spread-selector__button spread-selector__button--active" : "spread-selector__button"} type="button" key={key} aria-pressed={selection === key} onClick={() => setSelection(key)}>{key === "ALL" ? "All" : key}</button>
              ))}
            </div>
          </div>
        </div>

        {hasChartData ? (
          <div className="intraday-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series} margin={{ top: 14, right: 18, bottom: 3, left: -5 }}>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 6" />
                <XAxis dataKey="timestamp" minTickGap={48} tickFormatter={(value) => formatNewYorkTime(String(value))} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <YAxis width={52} domain={["dataMin - 0.02", "dataMax + 0.02"]} tickFormatter={(value) => `${Number(value).toFixed(2)}%`} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} />
                <Tooltip content={<IntradayTooltip />} cursor={{ stroke: "var(--chart-crosshair)", strokeDasharray: "3 4" }} />
                {selection === "ALL" ? <Legend verticalAlign="top" align="right" iconType="plainline" wrapperStyle={{ color: "var(--muted)", fontSize: 11 }} /> : null}
                {selectedPriorClose !== null ? <ReferenceLine y={selectedPriorClose} stroke="var(--comparison-reference)" strokeDasharray="5 5" label={{ value: "Prior close", position: "insideTopRight", fill: "var(--muted)", fontSize: 10 }} /> : null}
                {selectedKeys.map((key) => <Line key={key} type="linear" dataKey={key} name={key} connectNulls={false} dot={false} stroke={colors[key]} strokeWidth={selection === "ALL" ? 1.9 : 2.3} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="intraday-chart-empty">Current quotes are available, but the provider has not supplied enough timestamped session marks to draw the intraday path.</div>}

        <div className="intraday-chart-footnote">
          <span>Yield change is current mid, or last when no two-sided quote is available, minus provider prior close.</span>
          <span>Higher yield = selloff; lower yield = rally. Times shown in New York time.</span>
          {isFetching ? <span className="intraday-refresh"><RefreshCw className="spin" size={12} aria-hidden="true" />Refreshing</span> : null}
        </div>
      </article>
    </div>
  );
}
