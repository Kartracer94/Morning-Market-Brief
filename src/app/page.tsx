"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import "./globals.css";

// ── Types ──
interface FutureItem { symbol: string; name: string; price?: number; change_pct?: number }
interface FXItem { symbol: string; name?: string; price?: number; change_pct?: number }
interface SectorItem { symbol: string; name: string; price?: number; change_pct?: number }
interface Mover { symbol: string; name: string; change_pct: number; price?: number; reason?: string }
interface MoversData { gainers: Mover[]; losers: Mover[] }
interface EconEvent { time: string; event: string; forecast?: string; previous?: string; actual?: string }

// ── Config ──
const FUTURES_META: { symbol: string; name: string; yahoo: string }[] = [
  { symbol: "NQ", name: "Nasdaq 100", yahoo: "NQ=F" },
  { symbol: "ES", name: "S&P 500", yahoo: "ES=F" },
  { symbol: "CL", name: "Crude Oil", yahoo: "CL=F" },
  { symbol: "GC", name: "Gold", yahoo: "GC=F" },
  { symbol: "BTC", name: "Bitcoin", yahoo: "BTC-USD" },
];

const FX_META = [
  { symbol: "USD/JPY", name: "Japanese Yen" },
  { symbol: "DXY", name: "Dollar Index" },
];

const SECTOR_META = [
  { symbol: "XLB", name: "Materials" }, { symbol: "XLC", name: "Comm. Services" },
  { symbol: "XLE", name: "Energy" }, { symbol: "XLF", name: "Financials" },
  { symbol: "XLI", name: "Industrials" }, { symbol: "XLK", name: "Technology" },
  { symbol: "XLP", name: "Consumer Staples" }, { symbol: "XLRE", name: "Real Estate" },
  { symbol: "XLU", name: "Utilities" }, { symbol: "XLV", name: "Health Care" },
  { symbol: "XLY", name: "Consumer Disc." },
];

const TV_SYMS = [
  { id: "tv-NQ", sym: "CME_MINI:NQ1!" },
  { id: "tv-ES", sym: "CME_MINI:ES1!" },
  { id: "tv-CL", sym: "NYMEX:CL1!" },
  { id: "tv-GC", sym: "COMEX:GC1!" },
  { id: "tv-DXY", sym: "TVC:DXY" },
];

// ── Helpers ──
function fmtP(p?: number) {
  if (p == null || isNaN(p)) return "—";
  return Math.abs(p) >= 1000 ? p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : p.toFixed(2);
}
function fmtPct(v?: number) {
  if (v == null || isNaN(v)) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(2) + "%";
}
function pctClass(v?: number) {
  if (v == null) return "fl";
  return v > 0 ? "up" : v < 0 ? "dn" : "fl";
}

function Skeleton({ rows = 4 }: { rows?: number }) {
  return <>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="sk-row"><div className="sk a" /><div className="sk b" /><div className="sk c" /></div>
    ))}
  </>;
}

// ── API fetch ──
async function fetchSection(section: string, briefData?: unknown) {
  const res = await fetch("/api/market-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section, briefData }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Fetch failed");
  return json.data;
}

// ── TradingView widget loader ──
function TradingViewWidget({ id, symbol }: { id: string; symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "tradingview-widget-container";
    wrap.style.height = "132px";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    wrap.appendChild(inner);
    const sc = document.createElement("script");
    sc.type = "text/javascript";
    sc.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    sc.async = true;
    sc.textContent = JSON.stringify({
      symbol, width: "100%", height: 132, locale: "en", dateRange: "1D",
      colorTheme: "dark", isTransparent: true, autosize: false, largeChartUrl: "",
    });
    wrap.appendChild(sc);
    el.appendChild(wrap);
  }, [symbol]);

  return <div className="tv-w" id={id} ref={containerRef} />;
}

// ── Main ──
export default function Dashboard() {
  const [clock, setClock] = useState("");
  const [futures, setFutures] = useState<FutureItem[] | null>(null);
  const [fx, setFx] = useState<FXItem[] | null>(null);
  const [sectors, setSectors] = useState<SectorItem[] | null>(null);
  const [movers, setMovers] = useState<MoversData | null>(null);
  const [events, setEvents] = useState<EconEvent[] | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [status, setStatus] = useState("Initializing");
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const setLoad = (k: string, v: boolean) => setLoading(p => ({ ...p, [k]: v }));
  const setErr = (k: string, v: string | null) => setErrors(p => ({ ...p, [k]: v }));

  // Clock
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleString("en-US", {
      weekday: "short", month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Data fetchers ──
  const fetchFutures = useCallback(async () => {
    setLoad("futures", true); setErr("futures", null);
    try {
      const data = await fetchSection("futures");
      if (Array.isArray(data)) {
        const mapped = FUTURES_META.map(f => {
          const match = data.find((p: { symbol?: string }) => p.symbol === f.yahoo || p.symbol?.includes(f.symbol));
          return { ...f, price: match?.price, change_pct: match?.change_pct };
        });
        setFutures(mapped);
      }
    } catch (e) { setErr("futures", (e as Error).message); }
    setLoad("futures", false);
  }, []);

  const fetchFX = useCallback(async () => {
    setLoad("fx", true); setErr("fx", null);
    try {
      const data = await fetchSection("fx");
      if (Array.isArray(data)) {
        const mapped = FX_META.map(f => {
          const match = data.find((p: { symbol?: string }) => p.symbol === f.symbol || p.symbol?.includes(f.symbol.split("/")[0]));
          return { ...f, price: match?.price, change_pct: match?.change_pct };
        });
        setFx(mapped);
      }
    } catch (e) { setErr("fx", (e as Error).message); }
    setLoad("fx", false);
  }, []);

  const fetchSectors = useCallback(async () => {
    setLoad("sectors", true); setErr("sectors", null);
    try {
      const data = await fetchSection("sectors");
      if (Array.isArray(data)) {
        const mapped = SECTOR_META.map(s => {
          const match = data.find((p: { symbol?: string }) => p.symbol === s.symbol);
          return { ...s, price: match?.price, change_pct: match?.change_pct };
        }).sort((a, b) => (b.change_pct || 0) - (a.change_pct || 0));
        setSectors(mapped);
      }
    } catch (e) { setErr("sectors", (e as Error).message); }
    setLoad("sectors", false);
  }, []);

  const fetchMovers = useCallback(async () => {
    setLoad("movers", true); setErr("movers", null);
    try {
      const data = await fetchSection("movers");
      if (data && (data.gainers || data.losers)) setMovers(data);
    } catch (e) { setErr("movers", (e as Error).message); }
    setLoad("movers", false);
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoad("events", true); setErr("events", null);
    try {
      const data = await fetchSection("events");
      if (Array.isArray(data)) setEvents(data);
    } catch (e) { setErr("events", (e as Error).message); }
    setLoad("events", false);
  }, []);

  const refreshAll = useCallback(async () => {
    setStatus("Fetching");
    await Promise.allSettled([fetchFutures(), fetchFX(), fetchSectors(), fetchMovers(), fetchEvents()]);
    const t = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    setStatus(`Updated ${t}`);
  }, [fetchFutures, fetchFX, fetchSectors, fetchMovers, fetchEvents]);

  useEffect(() => {
    if (!hasFetched.current) { hasFetched.current = true; refreshAll(); }
  }, [refreshAll]);

  const anyLoading = Object.values(loading).some(Boolean);

  const generateEmail = async () => {
    setLoad("email", true);
    try {
      const data = await fetchSection("email", { futures, fx, sectors, movers, events });
      setEmailDraft(data);
    } catch { setEmailDraft("Failed to generate email draft."); }
    setLoad("email", false);
  };

  return (
    <>
      {/* Header */}
      <div className="hdr">
        <div className="hdr-l">
          <h1>Morning Markets</h1>
          <span className="ts">{clock}</span>
        </div>
        <div className="hdr-r">
          <div className="dot" style={{ background: anyLoading ? "var(--amb)" : "var(--grn)" }} />
          <span className="sts">{anyLoading ? "Fetching" : status}</span>
          <button className="btn" disabled={anyLoading} onClick={refreshAll}>
            {anyLoading ? "↻ Loading…" : "↻ Refresh"}
          </button>
          <button className="btn btn-a" disabled={anyLoading || !futures} onClick={generateEmail}>
            {loading.email ? "Drafting…" : "✉ Email Brief"}
          </button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid">
        {/* ── LEFT COLUMN ── */}
        <div className="col">
          <div className="sh"><span className="tg">Futures</span><span className="ct">TradingView + AI</span></div>
          {TV_SYMS.slice(0, 4).map(tv => (
            <TradingViewWidget key={tv.id} id={tv.id} symbol={tv.sym} />
          ))}

          {/* API-fetched futures data below charts */}
          {loading.futures ? <Skeleton rows={5} /> : errors.futures ? (
            <div className="msg err-msg">⚠ {errors.futures}</div>
          ) : futures ? futures.map(f => (
            <div key={f.symbol} className="qr">
              <div><div className="sy">{f.symbol}</div><div className="nm">{f.name}</div></div>
              <div className="px">{fmtP(f.price)}</div>
              <span className={`cg ${pctClass(f.change_pct)}`}>{fmtPct(f.change_pct)}</span>
            </div>
          )) : null}

          <div className="sh"><span className="tg">FX &amp; Dollar</span><span className="ct">AI Search</span></div>
          <TradingViewWidget id="tv-DXY" symbol="TVC:DXY" />
          {loading.fx ? <Skeleton rows={2} /> : errors.fx ? (
            <div className="msg err-msg">⚠ {errors.fx}</div>
          ) : fx ? fx.map(f => (
            <div key={f.symbol} className="qr">
              <div><div className="sy">{f.symbol}</div><div className="nm">{f.name}</div></div>
              <div className="px">{fmtP(f.price)}</div>
              <span className={`cg ${pctClass(f.change_pct)}`}>{fmtPct(f.change_pct)}</span>
            </div>
          )) : null}
        </div>

        {/* ── CENTER COLUMN ── */}
        <div className="col">
          <div className="sh"><span className="tg">Sector ETFs</span><span className="ct">Sorted by Performance</span></div>
          {loading.sectors ? <Skeleton rows={11} /> : errors.sectors ? (
            <div className="msg err-msg">⚠ {errors.sectors}</div>
          ) : sectors ? sectors.map(s => {
            const pct = s.change_pct || 0;
            const barW = Math.min(Math.abs(pct) * 20, 100);
            const isPos = pct >= 0;
            return (
              <div key={s.symbol} className="sector-row">
                <span className="sector-sym">{s.symbol}</span>
                <span className="sector-name">{s.name}</span>
                <div className="sector-bar-wrap">
                  <div className="sector-bar" style={{
                    width: `${barW}%`,
                    background: isPos ? "var(--grn)" : "var(--red)",
                    opacity: 0.35,
                    [isPos ? "left" : "right"]: 0,
                  }} />
                </div>
                <span className="sector-pct" style={{ color: isPos ? "var(--grn)" : "var(--red)" }}>
                  {fmtPct(s.change_pct)}
                </span>
              </div>
            );
          }) : null}

          <div className="sh"><span className="tg">Economic Calendar</span><span className="ct">High Importance</span></div>
          {loading.events ? <Skeleton rows={3} /> : errors.events ? (
            <div className="msg err-msg">⚠ {errors.events}</div>
          ) : events ? (
            events.length === 0 ? (
              <div className="msg">No high-importance US events today</div>
            ) : events.map((ev, i) => (
              <div key={i} className={`ev hi`}>
                <div className="t">{ev.time}</div>
                <div className="ti">{ev.event}</div>
                <div className="vl">
                  <span>Act: <b>{ev.actual || "—"}</b></span>
                  <span>Fcst: <b>{ev.forecast || "—"}</b></span>
                  <span>Prev: <b>{ev.previous || "—"}</b></span>
                </div>
              </div>
            ))
          ) : null}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="col">
          <div className="sh"><span className="tg" style={{ color: "var(--grn)" }}>▲ Top Gainers</span></div>
          {loading.movers ? <Skeleton rows={6} /> : errors.movers ? (
            <div className="msg err-msg">⚠ {errors.movers}</div>
          ) : movers?.gainers ? movers.gainers.map((m, i) => (
            <div key={i} className="mover-row">
              <div>
                <div className="mover-sym">{m.symbol}</div>
                <div className="mover-name">{m.name}</div>
                {m.reason && <div className="mover-reason">{m.reason}</div>}
              </div>
              <div className="mover-right">
                <span className={`cg up`}>{fmtPct(m.change_pct)}</span>
                {m.price && <div className="mover-price">${fmtP(m.price)}</div>}
              </div>
            </div>
          )) : null}

          <div className="sh"><span className="tg" style={{ color: "var(--red)" }}>▼ Top Losers</span></div>
          {loading.movers ? <Skeleton rows={6} /> : movers?.losers ? movers.losers.map((m, i) => (
            <div key={i} className="mover-row">
              <div>
                <div className="mover-sym">{m.symbol}</div>
                <div className="mover-name">{m.name}</div>
                {m.reason && <div className="mover-reason">{m.reason}</div>}
              </div>
              <div className="mover-right">
                <span className={`cg dn`}>{fmtPct(m.change_pct)}</span>
                {m.price && <div className="mover-price">${fmtP(m.price)}</div>}
              </div>
            </div>
          )) : null}
        </div>
      </div>

      {/* Email modal */}
      {emailDraft && (
        <div className="overlay" onClick={() => setEmailDraft(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hdr">
              <h2>Morning Brief Email Draft</h2>
              <button className="modal-close" onClick={() => setEmailDraft(null)}>✕</button>
            </div>
            <pre>{emailDraft}</pre>
            <div className="modal-foot">
              <button className="btn" onClick={() => navigator.clipboard.writeText(emailDraft)}>
                Copy to Clipboard
              </button>
              <button className="btn" onClick={() => setEmailDraft(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
