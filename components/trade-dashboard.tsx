"use client";

import { useState } from "react";

type Side = "BUY" | "SELL";
const metrics = [
  ["Expected slippage", "0.38%", "VWAP vs. best ask", 42, "moderate"],
  ["Liquidity", "$184.2K", "Ask depth within 0.5%", 24, "low"],
  ["Volatility", "1.26%", "ATR · 60 completed 5m", 58, "moderate"],
  ["Order-size risk", "8.7%", "Notional / 1% depth", 31, "low"],
  ["Concentration", "12.0%", "Proposal-only estimate", 36, "low"],
] as const;

function Shield() {
  return <span className="shield" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2.5 20 6v5.8c0 4.9-3.3 8.1-8 9.7-4.7-1.6-8-4.8-8-9.7V6l8-3.5Z" stroke="currentColor" strokeWidth="1.7"/><path d="m8.2 12.1 2.4 2.4 5.4-5.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span>;
}
function Dot({ amber = false }: { amber?: boolean }) { return <i className={`dot ${amber ? "amber" : ""}`} aria-hidden="true"/>; }

export function TradeDashboard({ developmentPreview }: { developmentPreview: boolean }) {
  const [side, setSide] = useState<Side>("BUY");
  const [showPreview, setShowPreview] = useState(developmentPreview);
  const visible = developmentPreview && showPreview;

  return <main className="terminal">
    <header className="topbar">
      <div className="brand"><Shield/><div><strong>TradeGuard</strong><span>AI Pre-Trade Safety Firewall</span></div></div>
      <div className="connection"><Dot/>Agent OS: Not connected</div>
    </header>

    <div className="frame">
      {developmentPreview && <div className="preview"><div><b>DEVELOPMENT PREVIEW</b><span>Sample data — not live Binance data</span></div><button onClick={() => setShowPreview((v) => !v)}>{showPreview ? "Hide sample" : "Show sample"}</button></div>}

      <div className="workspace">
        <aside className="panel trade-panel">
          <div className="panel-head"><div><p className="eyebrow">Trade input</p><h1>Proposed Trade</h1></div><span>01</span></div>
          <form className="trade-form" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="symbol">Symbol</label>
            <div className="input"><input id="symbol" defaultValue={developmentPreview ? "LQTYUSDT" : "BTCUSDT"} spellCheck={false}/><span>SPOT</span></div>
            <label>Side</label>
            <div className="side" role="group" aria-label="Trade side"><button type="button" className={side === "BUY" ? "buy active" : ""} onClick={() => setSide("BUY")}>BUY</button><button type="button" className={side === "SELL" ? "sell active" : ""} onClick={() => setSide("SELL")}>SELL</button></div>
            <label htmlFor="amount">Amount</label>
            <div className="input"><input id="amount" type="number" min="0" defaultValue="1000"/><span>USDT</span></div>
            <div className="divider"><span>Optional context</span></div>
            <label htmlFor="portfolio">Portfolio value <em>Optional</em></label>
            <div className="input"><input id="portfolio" type="number" min="0" placeholder="10,000"/><span>USDT</span></div>
            <label htmlFor="exposure">Existing symbol exposure <em>Optional</em></label>
            <div className="input"><input id="exposure" type="number" min="0" placeholder="0"/><span>USDT</span></div>
            <button className="analyze" type="button" disabled><Shield/>Analyze Trade</button>
            <p className="disabled-note"><Dot amber/>Live analysis unlocks when Agent OS is connected in Milestone 3B.</p>
          </form>
        </aside>

        <section className="assessment">
          <article className="panel hero">
            <div className="section-head"><div><p className="eyebrow">Deterministic assessment</p><h2>TradeGuard Assessment</h2></div><code>{visible ? "SAMPLE" : "AWAITING DATA"}</code></div>
            <div className="score-area">
              <div className={`score-ring ${visible ? "filled" : ""}`}><div><strong>{visible ? "43" : "—"}</strong><span>/ 100</span></div></div>
              <div className="verdict"><b>{visible ? "MEDIUM RISK" : "NOT ASSESSED"}</b><p>Final verdict</p><h3>{visible ? "REDUCE SIZE" : "ASSESSMENT UNAVAILABLE"}</h3><div><span>Safer suggested amount</span><strong>{visible ? "$620 USDT" : "—"}</strong></div></div>
            </div>
          </article>

          <div className="metric-grid">{metrics.map(([name, value, detail, , tone]) => <article className="metric" key={name}><div><span>{name}</span><i className={visible ? tone : ""}/></div><strong>{visible ? value : "—"}</strong><p>{visible ? detail : "Awaiting live assessment"}</p></article>)}</div>

          <div className="details">
            <article className="panel breakdown"><div className="section-head"><div><p className="eyebrow">Component visibility</p><h2>Score breakdown</h2></div><span>{visible ? "5 / 5 assessed" : "0 / 5 assessed"}</span></div><div className="bars">{metrics.map(([name, , , score]) => <div className="bar" key={name}><span>{name}</span><div><i style={{width: visible ? `${score}%` : 0}}/></div><strong>{visible ? score : "—"}</strong></div>)}</div><p className="method">Applicable deterministic components are normalized to 0–100. Critical risks can override the weighted result.</p></article>
            <article className="panel explanation"><p className="eyebrow">Verified findings only</p><h2>Why TradeGuard reached this verdict</h2>{visible ? <ul><li>Simulated fill slippage is above the preferred low-risk range.</li><li>Observable near-price liquidity can fill the sample order, but reducing size improves execution quality.</li><li>Short-window ATR indicates moderately elevated movement.</li></ul> : <p className="empty">Connect Binance Agent OS to generate a deterministic explanation from verified market measurements.</p>}</article>
          </div>

          <article className="panel provenance"><div className="section-head"><div><p className="eyebrow">Audit trail</p><h2>Data provenance</h2></div><b className="unavailable"><Dot amber/>Live Agent OS assessment unavailable</b></div><div className="provenance-grid"><Item label="Source" value={visible ? "Development sample" : "Binance Agent OS"}/><Item label="Symbol" value={visible ? "LQTYUSDT" : "—"}/><Item label="Retrieved" value="—"/><Item label="Book depth" value={visible ? "Sample: 100 levels" : "—"}/><Item label="Candle interval" value={visible ? "Sample: 5m" : "—"}/><Item label="Coverage" value={visible ? "Sample: 100%" : "—"}/></div></article>
        </section>
      </div>

      <section className="panel history"><div className="section-head"><div><p className="eyebrow">Session record</p><h2>Assessment history</h2></div><span>0 assessments</span></div><div className="history-empty"><b>↳</b><div><strong>No assessment history yet</strong><p>Your first risky assessment and safer reassessment will appear here after live Agent OS integration.</p></div></div></section>
    </div>
    <footer><span>TRADEGUARD / PRE-TRADE RISK CONTROL</span><span>Analysis only · No order execution</span></footer>
  </main>;
}

function Item({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
