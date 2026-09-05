"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { parseAssessmentEnvelope, type AssessmentEnvelope } from "@/lib/assessment-bridge";
import type { Assessment, AssessmentStatus, RiskMetric, TradeSide } from "@/lib/risk-engine";

type HistoryEntry = { symbol: string; side: TradeSide; amount: number; status: AssessmentStatus; score: number; at: number };
type MetricView = { name: string; value: string; detail: string; score: number | null; level?: RiskMetric["level"] };
const sampleMetrics: MetricView[] = [
  { name: "Expected slippage", value: "0.38%", detail: "VWAP vs. best ask", score: 42, level: "MODERATE" },
  { name: "Liquidity", value: "$184.2K", detail: "Ask depth within 0.5%", score: 24, level: "LOW" },
  { name: "Volatility", value: "1.26%", detail: "ATR · 60 completed 5m", score: 58, level: "MODERATE" },
  { name: "Order-size risk", value: "8.7%", detail: "Notional / 1% depth", score: 31, level: "LOW" },
  { name: "Concentration", value: "12.0%", detail: "Proposal-only estimate", score: 36, level: "LOW" },
];

function Shield() { return <span className="shield" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2.5 20 6v5.8c0 4.9-3.3 8.1-8 9.7-4.7-1.6-8-4.8-8-9.7V6l8-3.5Z" stroke="currentColor" strokeWidth="1.7"/><path d="m8.2 12.1 2.4 2.4 5.4-5.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg></span>; }
function Dot({ tone = "muted" }: { tone?: "muted" | "amber" | "green" }) { return <i className={`dot ${tone}`} aria-hidden="true"/>; }
function money(value: number): string { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }
function percent(value: number): string { return `${value.toFixed(value < 1 ? 3 : 2)}%`; }
function displayStatus(status: AssessmentStatus): string { return status.replaceAll("_", " "); }
function classification(score: number | null): string { return score === null ? "NOT ASSESSED" : score < 25 ? "LOW RISK" : score < 50 ? "MEDIUM RISK" : "HIGH RISK"; }
function tone(level?: RiskMetric["level"]): string { return level === "LOW" ? "low" : level === "MODERATE" ? "moderate" : level ? "high" : ""; }
function metricViews(assessment: Assessment): MetricView[] {
  const m = assessment.metrics;
  if (!m) return sampleMetrics.map(({ name }) => ({ name, value: "—", detail: "Not assessed", score: null }));
  return [
    { name: "Expected slippage", value: percent(m.slippage.slippagePercent), detail: `VWAP vs. ${m.slippage.referencePrice.toLocaleString()}`, score: m.slippage.score, level: m.slippage.level },
    { name: "Liquidity", value: money(m.liquidity.sameSideQuoteDepthWithinHalfPercent), detail: `Spread ${percent(m.liquidity.spreadPercent)}`, score: m.liquidity.score, level: m.liquidity.level },
    { name: "Volatility", value: percent(m.volatility.atrPercent), detail: `Log-return σ ${percent(m.volatility.logReturnStdDevPercent)}`, score: m.volatility.score, level: m.volatility.level },
    { name: "Order-size risk", value: percent(m.orderSize.orderSizeRatioPercent), detail: `${money(m.orderSize.sameSideQuoteDepthWithinOnePercent)} within 1%`, score: m.orderSize.score, level: m.orderSize.level },
    { name: "Concentration", value: m.concentration ? percent(m.concentration.postTradePercent ?? m.concentration.proposalPercent) : "Not assessed", detail: m.concentration?.basis === "POST_TRADE" ? "Post-trade concentration" : "Proposal-only estimate", score: m.concentration?.score ?? null, level: m.concentration?.level },
  ];
}

export function TradeDashboard({ developmentPreview }: { developmentPreview: boolean }) {
  const [side, setSide] = useState<TradeSide>("BUY");
  const [symbol, setSymbol] = useState(developmentPreview ? "LQTYUSDT" : "BTCUSDT");
  const [amount, setAmount] = useState("1000");
  const [portfolio, setPortfolio] = useState("");
  const [exposure, setExposure] = useState("");
  const [showPreview, setShowPreview] = useState(developmentPreview);
  const [json, setJson] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [imported, setImported] = useState<AssessmentEnvelope | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  function importAssessment() {
    try {
      const envelope = parseAssessmentEnvelope(json);
      setImported(envelope); setShowPreview(false); setNotice("Codex-hosted TradeGuard assessment imported.");
      setSymbol(envelope.request.symbol); setSide(envelope.request.side); setAmount(String(envelope.request.proposedNotional));
      setPortfolio(envelope.request.portfolioValue === undefined ? "" : String(envelope.request.portfolioValue));
      setExposure(envelope.request.existingSymbolExposure === undefined ? "" : String(envelope.request.existingSymbolExposure));
      setHistory((items) => [{ symbol: envelope.request.symbol, side: envelope.request.side, amount: envelope.request.proposedNotional, status: envelope.assessment.status, score: envelope.assessment.score!, at: envelope.provenance.retrievedAt }, ...items].slice(0, 6));
    } catch (error) { setNotice(error instanceof Error ? error.message : "Assessment import failed."); }
  }

  const sample = developmentPreview && showPreview && !imported;
  const assessment = imported?.assessment;
  const score = assessment?.score ?? (sample ? 43 : null);
  const verdict = assessment?.status ?? (sample ? "REDUCE_SIZE" : "ASSESSMENT_UNAVAILABLE");
  const metrics = useMemo<MetricView[]>(() => assessment ? metricViews(assessment) : sample ? sampleMetrics : sampleMetrics.map(({ name }) => ({ name, value: "—", detail: "Awaiting Codex assessment", score: null })), [assessment, sample]);

  return <main className="terminal">
    <header className="topbar"><div className="brand"><Shield/><div><strong>TradeGuard</strong><span>AI Pre-Trade Safety Firewall</span></div></div><div className="connection connected"><Dot tone="green"/>Agent OS: Codex-hosted workflow</div></header>
    <div className="frame">
      {developmentPreview && <div className="preview"><div><b>DEVELOPMENT PREVIEW</b><span>Sample data — not live Binance data</span></div><button onClick={() => setShowPreview((v) => !v)}>{showPreview ? "Hide sample" : "Show sample"}</button></div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      <div className="workspace">
        <aside className="panel trade-panel"><div className="panel-head"><div><p className="eyebrow">Trade input</p><h1>Proposed Trade</h1></div><span>01</span></div><form className="trade-form" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="symbol">Symbol</label><div className="input"><input id="symbol" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} spellCheck={false}/><span>SPOT</span></div>
          <label>Side</label><div className="side" role="group" aria-label="Trade side"><button type="button" className={side === "BUY" ? "buy active" : ""} onClick={() => setSide("BUY")}>BUY</button><button type="button" className={side === "SELL" ? "sell active" : ""} onClick={() => setSide("SELL")}>SELL</button></div>
          <label htmlFor="amount">Amount</label><div className="input"><input id="amount" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}/><span>USDT</span></div>
          <div className="divider"><span>Optional context</span></div>
          <label htmlFor="portfolio">Portfolio value <em>Optional</em></label><div className="input"><input id="portfolio" type="number" min="0" value={portfolio} onChange={(e) => setPortfolio(e.target.value)} placeholder="10,000"/><span>USDT</span></div>
          <label htmlFor="exposure">Existing symbol exposure <em>Optional</em></label><div className="input"><input id="exposure" type="number" min="0" value={exposure} onChange={(e) => setExposure(e.target.value)} placeholder="0"/><span>USDT</span></div>
          <button className="analyze" type="button" disabled><Shield/>Run assessment in Codex</button><p className="disabled-note"><Dot tone="amber"/>Use the TradeGuard Codex workflow, then import its completed assessment below.</p>
          <details className="importer"><summary>Import Codex assessment JSON</summary><textarea aria-label="TradeGuard assessment JSON" value={json} onChange={(e) => setJson(e.target.value)} placeholder="Paste the complete tradeguard.assessment.v1 JSON envelope"/><button type="button" onClick={importAssessment}>Load assessment</button></details>
        </form></aside>
        <section className="assessment">
          <article className="panel hero"><div className="section-head"><div><p className="eyebrow">Deterministic assessment</p><h2>TradeGuard Assessment</h2></div><code>{imported ? "IMPORTED MCP" : sample ? "SAMPLE" : "AWAITING DATA"}</code></div><div className="score-area"><div className={`score-ring ${score !== null ? "filled" : ""}`} style={score !== null ? { "--score": `${score}%` } as CSSProperties : undefined}><div><strong>{score === null ? "—" : Math.round(score)}</strong><span>/ 100</span></div></div><div className="verdict"><b>{classification(score)}</b><p>Final verdict</p><h3>{displayStatus(verdict)}</h3><div><span>Safer suggested amount</span><strong>{assessment?.saferAmount != null ? `${money(assessment.saferAmount)} USDT` : sample ? "$620 USDT" : "—"}</strong></div></div></div></article>
          <div className="metric-grid">{metrics.map((metric) => <article className="metric" key={metric.name}><div><span>{metric.name}</span><i className={tone(metric.level)}/></div><strong>{metric.value}</strong><p>{metric.detail}</p></article>)}</div>
          <div className="details"><article className="panel breakdown"><div className="section-head"><div><p className="eyebrow">Component visibility</p><h2>Score breakdown</h2></div><span>{assessment ? `${assessment.coverage.assessedComponents.length} / ${assessment.coverage.applicableComponents.length} assessed` : sample ? "5 / 5 assessed" : "0 / 5 assessed"}</span></div><div className="bars">{metrics.map((metric) => <div className="bar" key={metric.name}><span>{metric.name}</span><div><i style={{ width: metric.score === null ? 0 : `${metric.score}%` }}/></div><strong>{metric.score === null ? "—" : Math.round(metric.score)}</strong></div>)}</div><p className="method">Applicable deterministic components are normalized to 0–100. Critical risks can override the weighted result.</p></article>
          <article className="panel explanation"><p className="eyebrow">Verified findings only</p><h2>Why TradeGuard reached this verdict</h2>{imported ? <ul>{imported.explanation.map((item) => <li key={item}>{item}</li>)}</ul> : sample ? <ul><li>Simulated fill slippage is above the preferred low-risk range.</li><li>Observable near-price liquidity can fill the sample order, but reducing size improves execution quality.</li><li>Short-window ATR indicates moderately elevated movement.</li></ul> : <p className="empty">Run TradeGuard in Codex and import the completed result to display verified findings.</p>}</article></div>
          <article className="panel provenance"><div className="section-head"><div><p className="eyebrow">Audit trail</p><h2>Data provenance</h2></div><b className={imported ? "available" : "unavailable"}><Dot tone={imported ? "green" : "amber"}/>{imported ? "Imported Binance Agent OS assessment" : "Agent OS assessment not imported"}</b></div><div className="provenance-grid"><Item label="Source" value={imported ? "Binance Agent OS" : sample ? "Development sample" : "—"}/><Item label="Symbol" value={imported?.request.symbol ?? (sample ? "LQTYUSDT" : "—")}/><Item label="Retrieved" value={imported ? new Date(imported.provenance.retrievedAt).toLocaleTimeString() : "—"}/><Item label="Book depth" value={imported ? `${imported.provenance.orderBookDepthUsed} levels` : sample ? "Sample: 100 levels" : "—"}/><Item label="Candle interval" value={imported ? `${imported.provenance.candleInterval} · ${imported.provenance.candleCount}` : sample ? "Sample: 5m" : "—"}/><Item label="Coverage" value={assessment ? `${Math.round(assessment.coverage.ratio * 100)}%` : sample ? "Sample: 100%" : "—"}/></div></article>
        </section>
      </div>
      <section className="panel history"><div className="section-head"><div><p className="eyebrow">Session record</p><h2>Assessment history</h2></div><span>{history.length} assessment{history.length === 1 ? "" : "s"}</span></div>{history.length === 0 ? <div className="history-empty"><b>↳</b><div><strong>No assessment history yet</strong><p>Import the first risky assessment and safer reassessment from the Codex workflow.</p></div></div> : <div className="history-list">{history.map((item) => <div key={`${item.at}-${item.symbol}-${item.amount}`}><strong>{item.symbol} · {item.side}</strong><span>{money(item.amount)}</span><b>{displayStatus(item.status)} · {Math.round(item.score)}</b></div>)}</div>}</section>
    </div><footer><span>TRADEGUARD / PRE-TRADE RISK CONTROL</span><span>Analysis only · No order execution</span></footer>
  </main>;
}
function Item({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
