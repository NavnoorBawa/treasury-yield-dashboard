import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Info } from "lucide-react";
import { formatBps, formatDate, formatShortDate } from "../lib/format";
import {
  buildCurveMoveForDates,
  buildCurveRegimeTimeline,
  curveMoveTypes,
  type CurveMoveHorizon,
  type CurveMoveType,
  type CurvePair
} from "../lib/research";
import type { HistoricalRow } from "../types";

interface CurveRegimeTimelineProps {
  rows: HistoricalRow[];
  pair: CurvePair;
  startDate: string;
  endDate: string;
  horizon: CurveMoveHorizon;
}

interface RegimeBand {
  type: CurveMoveType;
  startDate: string;
  endDate: string;
}

const typeColor: Record<CurveMoveType, string> = {
  "Bull steepening": "var(--regime-bull-steepening)",
  "Bear steepening": "var(--regime-bear-steepening)",
  "Bull flattening": "var(--regime-bull-flattening)",
  "Bear flattening": "var(--regime-bear-flattening)",
  "Parallel shift higher": "var(--regime-parallel-higher)",
  "Parallel shift lower": "var(--regime-parallel-lower)"
};

const compactDateTick = (date: string) => {
  const value = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }).format(value);
};

interface RegimeTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: { date: string; comparisonDate: string; spreadBps: number; spreadDeltaBps: number; levelDeltaBps: number; type: CurveMoveType } }>;
}

function RegimeTooltip({ active, payload }: RegimeTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="chart-tooltip chart-tooltip--wide">
      <span className="chart-tooltip__label">{formatDate(point.date)}</span>
      <div className="chart-tooltip__rows">
        <div className="chart-tooltip__row"><span>Spread</span><strong>{point.spreadBps.toFixed(1)} bps</strong></div>
        <div className="chart-tooltip__row"><span>Change</span><strong>{formatBps(point.spreadDeltaBps)}</strong></div>
        <div className="chart-tooltip__row"><span>Average yield move</span><strong>{formatBps(point.levelDeltaBps)}</strong></div>
        <div className="chart-tooltip__row"><span>Reference</span><strong>{formatShortDate(point.comparisonDate)}</strong></div>
      </div>
      <em className="regime-tooltip__type" style={{ color: typeColor[point.type] }}>{point.type}</em>
    </div>
  );
}

export function CurveRegimeTimeline({ rows, pair, startDate, endDate, horizon }: CurveRegimeTimelineProps) {
  const timeline = useMemo(
    () => buildCurveRegimeTimeline(rows, pair, startDate, endDate, horizon),
    [endDate, horizon, pair, rows, startDate]
  );
  const rangeMove = useMemo(
    () => buildCurveMoveForDates(rows, pair, endDate, startDate),
    [endDate, pair, rows, startDate]
  );
  const bands = useMemo<RegimeBand[]>(() => {
    const result: RegimeBand[] = [];

    timeline.forEach((point, index) => {
      const nextDate = timeline[index + 1]?.date ?? point.date;
      const previous = result.at(-1);
      if (previous?.type === point.type) {
        previous.endDate = nextDate;
        return;
      }
      result.push({ type: point.type, startDate: point.date, endDate: nextDate });
    });

    return result;
  }, [timeline]);

  if (!timeline.length) {
    return <div className="empty-state">No complete observations are available for this segment and range.</div>;
  }

  return (
    <article className="panel regime-panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Color-coded curve regimes</p>
          <h3>{pair.longLabel} movement map</h3>
        </div>
        <span className="panel__meta">{horizon} classifications across the selected range</span>
      </div>

      <div className="regime-summary">
        <div>
          <span>Selected-window move</span>
          <strong>{rangeMove?.type ?? "Insufficient data"}</strong>
          <small>{rangeMove ? `${formatBps(rangeMove.spreadDeltaBps)} spread change from ${formatShortDate(rangeMove.comparisonDate)}` : "Select a wider date range"}</small>
        </div>
        <div>
          <span>Range-end spread</span>
          <strong>{timeline.at(-1)?.spreadBps.toFixed(1)} bps</strong>
          <small>As of {formatShortDate(timeline.at(-1)?.date)}</small>
        </div>
      </div>

      <div className="regime-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeline} margin={{ top: 14, right: 20, bottom: 6, left: -8 }}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 6" />
            <XAxis dataKey="date" minTickGap={42} tickFormatter={compactDateTick} tickLine={false} axisLine={false} tick={{ fill: "var(--muted)", fontSize: 12 }} />
            <YAxis tickLine={false} axisLine={false} width={58} tickFormatter={(value) => `${Number(value).toFixed(0)} bps`} tick={{ fill: "var(--muted)", fontSize: 12 }} />
            <Tooltip content={<RegimeTooltip />} />
            {bands.map((band, index) => (
              <ReferenceArea
                key={`${band.type}-${band.startDate}-${index}`}
                x1={band.startDate}
                x2={band.endDate}
                fill={typeColor[band.type]}
                fillOpacity={0.17}
                ifOverflow="extendDomain"
              />
            ))}
            <Line
              type="monotone"
              dataKey="spreadBps"
              name={pair.label}
              stroke="var(--chart-curve)"
              strokeWidth={2.35}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="regime-legend" aria-label="Curve movement regime legend">
        {curveMoveTypes.map((type) => (
          <span key={type}>
            <i style={{ backgroundColor: typeColor[type] }} />
            {type}
          </span>
        ))}
      </div>

      <div className="spread-note">
        <Info size={15} aria-hidden="true" />
        <span>
          Color bands classify the selected pair using its spread change and average yield-level change. A move of 3 bps or less in spread is treated as parallel; otherwise the chart assigns bull/bear steepening or flattening.
        </span>
      </div>
    </article>
  );
}
