// T6: Merge Gateway dashboard — the routing_log A's MergeRouter writes.
import { listRoutingLog } from "@/lib/db";
import { Meter } from "@/components/meter";
import { Sparkline } from "@/components/sparkline";

export default function Dashboard() {
  const rows = listRoutingLog();
  const cost = rows.reduce((s, r) => s + (r.cost_estimate ?? 0), 0);
  const avgLatency = rows.length
    ? Math.round(rows.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / rows.length)
    : 0;
  const frontierShare = rows.length
    ? Math.round((rows.filter((r) => r.tier === "frontier").length / rows.length) * 100)
    : 0;
  // rows come newest-first from listRoutingLog; chart oldest→newest:
  const costSeries = [...rows].reverse().map((r) => r.cost_estimate ?? 0);

  return (
    <>
      <h1>Model routing</h1>
      <p className="sub">
        Every LLM call Beagle makes, routed through Merge Gateway — cheap models for parsing,
        frontier for the human moments.
      </p>
      <div className="stat-row">
        <div className="card stat"><div className="n">{rows.length}</div><div className="l">calls</div></div>
        <div className="card stat"><div className="n">${cost.toFixed(4)}</div><div className="l">est. cost</div></div>
        <div className="card stat"><div className="n">{avgLatency} ms</div><div className="l">avg latency</div></div>
        <div className="card stat">
          <div className="n">{frontierShare}%</div>
          <div className="l">frontier calls <Meter value={frontierShare / 100} label={`${frontierShare}% frontier`} /></div>
        </div>
      </div>
      {costSeries.length >= 2 && (
        <div className="card">
          <div className="kicker">Cost per call</div>
          <Sparkline values={costSeries} width={720} height={56} />
        </div>
      )}
      <div className="card">
        <table className="data">
          <thead>
            <tr><th>time</th><th>model</th><th>tier</th><th>cost</th><th>latency</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.ts}</td>
                <td>{r.model}</td>
                <td className={`tier-${r.tier}`}>{r.tier === "frontier" ? "◆" : "◇"} {r.tier}</td>
                <td className="num">{r.cost_estimate == null ? "—" : `$${r.cost_estimate.toFixed(4)}`}</td>
                <td className="num">{r.latency_ms == null ? "—" : `${r.latency_ms} ms`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p style={{ margin: "10px 0 0" }}>No calls yet — routing shows up here as soon as the agent runs.</p>}
      </div>
    </>
  );
}

export const dynamic = "force-dynamic";
