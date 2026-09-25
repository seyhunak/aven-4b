"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./globals.css";

type Option = { label: string; key: string; description: string };
type Ticket = {
  id: string; category: string; tag: string; state: string;
  question: string; options: Option[]; expected: string; adversarial?: string;
  facts: unknown;
};
type Result = {
  label: string | null; status: string; latencyMs: number; prompt?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Page() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(220);
  const [filter, setFilter] = useState<"all" | "correct" | "wrong" | "adversarial">("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const stopRef = useRef(false);

  useEffect(() => {
    fetch("/api/tickets").then((r) => r.json()).then((d) => setTickets(d.tickets));
  }, []);

  const classifyOne = useCallback(async (t: Ticket) => {
    setBusy(t.id);
    const t0 = performance.now();
    const res = await fetch("/api/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(t),
    }).then((r) => r.json());
    res.clientMs = performance.now() - t0;
    setResults((m) => ({ ...m, [t.id]: res }));
    setBusy(null);
    return res as Result;
  }, []);

  const runAll = useCallback(async () => {
    stopRef.current = false;
    setRunning(true);
    for (const t of tickets) {
      if (stopRef.current) break;
      if (results[t.id]) continue;
      await classifyOne(t);
      if (speed > 0) await sleep(speed);
    }
    setRunning(false);
  }, [tickets, results, classifyOne, speed]);

  const reset = () => { stopRef.current = true; setResults({}); setRunning(false); setBusy(null); };

  const stats = useMemo(() => {
    const ids = Object.keys(results);
    const done = ids.length;
    let correct = 0, invalid = 0, lat = 0;
    const per: Record<string, { n: number; c: number }> = {};
    for (const t of tickets) {
      const r = results[t.id];
      if (!r) continue;
      if (r.label == null) invalid++;
      else if (r.label === t.expected) correct++;
      lat += r.latencyMs ?? 0;
      const k = t.expected;
      per[k] = per[k] || { n: 0, c: 0 };
      per[k].n++;
      if (r.label === t.expected) per[k].c++;
    }
    return {
      done, correct, invalid,
      acc: done ? (100 * correct) / done : 0,
      inv: done ? (100 * invalid) / done : 0,
      avg: done ? lat / done : 0,
      per,
    };
  }, [results, tickets]);

  const visible = tickets.filter((t) => {
    if (filter === "adversarial") return !!t.adversarial;
    const r = results[t.id];
    if (filter === "correct") return r && r.label === t.expected;
    if (filter === "wrong") return r && r.label !== t.expected;
    return true;
  });

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <div className="eyebrow">AVEN-4B · SPECIALIST DECISION MODEL</div>
          <h1>Live classification demo</h1>
          <p className="sub">
            50 preloaded tickets — invoice matching, reconciliation, support routing,
            plus adversarial probes. Each ticket is sent to the server in real time and
            answered with exactly one label.
          </p>
        </div>
        <div className="mode"><span className="dot" />demo engine · Aven contract</div>
      </header>

      <div className="stats">
        <div className="stat"><div className="k">CLASSIFIED</div><div className="v">{stats.done}/50</div></div>
        <div className="stat"><div className="k">ACCURACY</div><div className="v">{stats.acc.toFixed(1)}%</div></div>
        <div className="stat"><div className="k">INVALID</div><div className="v">{stats.inv.toFixed(1)}%</div></div>
        <div className="stat"><div className="k">AVG SERVER</div><div className="v">{stats.avg.toFixed(1)}<span style={{fontSize:14}}> ms</span></div></div>
        <div className="stat"><div className="k">PER-CLASS</div><div className="v small">
          {Object.keys(stats.per).sort().map((k) => (
            <span key={k} style={{marginRight:10}}>{k} {(100*stats.per[k].c/stats.per[k].n).toFixed(0)}%</span>
          ))}
          {stats.done === 0 && <span style={{color:"#5b6478"}}>—</span>}
        </div></div>
      </div>

      <div className="controls">
        <button className="primary" onClick={runAll} disabled={running || tickets.length===0 || stats.done===50}>
          {running ? "Classifying…" : stats.done>0 ? "Continue" : "Classify all 50"}
        </button>
        <button className="ghost" onClick={() => { stopRef.current = true; setRunning(false); }} disabled={!running}>Stop</button>
        <button className="ghost" onClick={reset} disabled={stats.done===0 && !running}>Reset</button>
        <label className="speed">pace
          <input type="range" min={0} max={900} step={20} value={speed} onChange={(e)=>setSpeed(+e.target.value)} />
          {speed}ms
        </label>
      </div>

      <div className="filters">
        {(["all","correct","wrong","adversarial"] as const).map((f) => (
          <button key={f} className={"chip"+(filter===f?" on":"")} onClick={()=>setFilter(f)}>{f}</button>
        ))}
      </div>

      <div className="progress"><div style={{width:`${(stats.done/50)*100}%`}} /></div>
      <div className="proglabel">{stats.done} of 50 classified · {stats.correct} correct · {stats.invalid} invalid</div>

      <div className="grid">
        {visible.map((t) => {
          const r = results[t.id];
          const cls = !r ? "pending" : r.label === t.expected ? "ok" : "wrong";
          return (
            <div key={t.id} className={`card ${cls}${open[t.id]?" open":""}`}>
              <div className="row1">
                <span className="tid">{t.id} · {t.category}</span>
                <span className={`tag${t.adversarial?" adv":""}`}>{t.adversarial ?? t.tag}</span>
              </div>
              <div className="state">{t.state}</div>
              <div className="out">
                <span className={`badge${busy===t.id?" busy":""}`}>{busy===t.id ? "…" : r?.label ?? "·"}</span>
                {r && <span className="meta">expected {t.expected} · {r.status} · {r.latencyMs.toFixed(1)} ms server</span>}
                {!r && <span className="meta">awaiting classification</span>}
              </div>
              {r?.prompt && (
                <>
                  <button className="toggle" onClick={()=>setOpen(o=>({...o,[t.id]:!o[t.id]}))}>
                    {open[t.id] ? "hide prompt" : "show prompt"}
                  </button>
                  {open[t.id] && <div className="prompt">{r.prompt}</div>}
                </>
              )}
            </div>
          );
        })}
      </div>

      <footer>
        Demo engine: deterministic mirror of Aven-4B&apos;s decision contract (same prompt
        template, same label validation as <code>src/aven/</code>). It reads only structured
        evidence — injections inside STATE are treated as data, never instructions.
        Production inference with real LoRA weights: <code>python scripts/inference.py</code> in
        the parent project. Starter data is synthetic smoke-test material, not production signal.
      </footer>
    </div>
  );
}
