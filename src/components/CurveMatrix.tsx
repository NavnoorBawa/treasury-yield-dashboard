import { ArrowDownRight, ArrowRight, ArrowUpRight, Database, TimerReset } from "lucide-react";
import { formatBps, formatDate, formatTimestamp } from "../lib/format";
import type { SpreadPoint, TreasuryPayload } from "../types";

interface CurveMatrixProps {
  data: TreasuryPayload;
}

const direction = (spread: SpreadPoint) => (spread.changeBps > 0 ? "up" : spread.changeBps < 0 ? "down" : "flat");

export function CurveMatrix({ data }: CurveMatrixProps) {
  return (
    <aside className="panel panel--curve-matrix">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Curve matrix</p>
          <h2>Core Curve Spreads</h2>
        </div>
        <span className="panel__meta">All 6 pair combinations</span>
      </div>

      <div className="curve-matrix" aria-label="Current Treasury curve spreads">
        {data.spreads.map((spread) => {
          const move = direction(spread);
          const Icon = move === "up" ? ArrowUpRight : move === "down" ? ArrowDownRight : ArrowRight;

          return (
            <div className="curve-matrix__item" key={spread.key}>
              <span>{spread.label}</span>
              <strong>{spread.valueBps.toFixed(1)} bps</strong>
              <small className={`curve-matrix__change curve-matrix__change--${move}`}>
                <Icon size={13} aria-hidden="true" />
                {formatBps(spread.changeBps)}
              </small>
            </div>
          );
        })}
      </div>

      <div className="curve-matrix__source">
        <span>
          <Database size={14} aria-hidden="true" />
          Record {formatDate(data.source.recordDate)}
        </span>
        <span>
          <TimerReset size={14} aria-hidden="true" />
          Feed {formatTimestamp(data.source.feedUpdatedAt)}
        </span>
      </div>
    </aside>
  );
}
