"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import "./globals.css";

// ── Types ──
interface QuoteItem { symbol: string; name: string; price: number; chg: number; pct: number }
interface Mover { symbol: string; name?: string; price: number; chg: number; pct: number }
interface MoversData { gainers: Mover[]; losers: Mover[] }
interface EconEvent { time: string; event: string; forecast?: string | null; previous?: string | null; actual?: string | null; importance: string }
type WeeklyCalendar = Record<string, EconEvent[]>;
interface SectorHolding { symbol: string; price: number; pct: number }
interface SectorDrilldown { gainers: SectorHolding[]; losers: SectorHolding[] }

// ── Helpers ──
function fmtP(p?: number) {
  if (p == null || isNaN(p)) return "—";
  return Math.abs(p) >= 1000
    ? p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : p.toFixed(2);
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
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="sk-row">
          <div className="sk a" /><div className="sk b" /><div className="sk c" />
        </div>
      ))}
    </>
  );
}

// ── API fetch ──
async function fetchSection(section: string) {
  const res = await fetch("/api/market-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Fetch failed");
  return json.data;
}

// ── Quote Row ──
function QuoteRow({ item }: { item: QuoteItem }) {
  return (
    <div className="qr">
      <div>
        <div className="sy">{item.symbol}</div>
        <div className="nm">{item.name}</div>
      </div>
      <div className="px">{fmtP(item.price)}</div>
      <span className={`cg ${pctClass(item.pct)}`}>{fmtPct(item.pct)}</span>
    </div>
  );
}

// ── TradingView Chart ──
function TVChart({ symbol, exchange, height = 400 }: { symbol: string; exchange: string; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "tradingview-widget-container";
    wrap.style.height = `${height}px`;
    const inner = document.createElement("div");
    inner.id = `tv-chart-${symbol}`;
    wrap.appendChild(inner);
    const sc = document.createElement("script");
    sc.type = "text/javascript";
    sc.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    sc.async = true;
    sc.textContent = JSON.stringify({
      symbol: `${exchange}:${symbol}`,
      width: "100%",
      height,
      autosize: false,
      interval: "5",
      timezone: "America/New_York",
      theme: "dark",
      style: "1",
      locale: "en",
      backgroundColor: "rgba(6, 8, 12, 1)",
      gridColor: "rgba(21, 28, 40, 0.6)",
      hide_top_toolbar: false,
      hide_legend: false,
      allow_symbol_change: false,
      save_image: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
    });
    wrap.appendChild(sc);
    el.appendChild(wrap);
  }, [symbol, exchange, height]);

  return <div className="tv-chart-wrap" ref={ref} />;
}

// ── Expandable Sector Row ──
function SectorRow({ item }: { item: QuoteItem }) {
  const [expanded, setExpanded] = useState(false);
  const [holdings, setHoldings] = useState<SectorDrilldown | null>(null);
  const [loadingH, setLoadingH] = useState(false);

  const pct = item.pct || 0;
  const barW = Math.min(Math.abs(pct) * 20, 100);
  const isPos = pct >= 0;

  const toggle = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (holdings) return;
    setLoadingH(true);
    try {
      const res = await fetch("/api/market-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "sector-holdings", etf: item.symbol }),
      });
      const json = await res.json();
      if (res.ok) setHoldings(json.data);
    } catch { /* ignore */ }
    setLoadingH(false);
  };

  return (
    <div>
      <div className="sector-row sector-clickable" onClick={toggle}>
        <span className="sector-sym">{item.symbol}</span>
        <span className="sector-name">{item.name}</span>
        <div className="sector-bar-wrap">
          <div className="sector-bar" style={{
            width: `${barW}%`,
            background: isPos ? "var(--grn)" : "var(--red)",
            opacity: 0.35,
            [isPos ? "left" : "right"]: 0,
          }} />
        </div>
        <span className="sector-pct" style={{ color: isPos ? "var(--grn)" : "var(--red)" }}>
          {fmtPct(item.pct)}
        </span>
        <span className="sector-chevron">{expanded ? "▾" : "▸"}</span>
      </div>
      {expanded && (
        <div className="sector-detail">
          {loadingH ? (
            <div className="sector-detail-loading">Loading…</div>
          ) : holdings ? (
            <div className="sector-detail-grid">
              <div className="sector-detail-col">
                <div className="sector-detail-hdr up">▲ Top 3</div>
                {holdings.gainers.map((h) => (
                  <div key={h.symbol} className="sector-detail-row">
                    <span className="sector-detail-sym">{h.symbol}</span>
                    <span className="sector-detail-price">${fmtP(h.price)}</span>
                    <span className={`sector-detail-pct ${h.pct >= 0 ? "up" : "dn"}`}>{fmtPct(h.pct)}</span>
                  </div>
                ))}
              </div>
              <div className="sector-detail-col">
                <div className="sector-detail-hdr dn">▼ Bottom 3</div>
                {holdings.losers.map((h) => (
                  <div key={h.symbol} className="sector-detail-row">
                    <span className="sector-detail-sym">{h.symbol}</span>
                    <span className="sector-detail-price">${fmtP(h.price)}</span>
                    <span className={`sector-detail-pct ${h.pct >= 0 ? "up" : "dn"}`}>{fmtPct(h.pct)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ── Main ──
export default function Dashboard() {
  const [clock, setClock] = useState("");
  const [markets, setMarkets] = useState<QuoteItem[] | null>(null);
  const [fx, setFx] = useState<QuoteItem[] | null>(null);
  const [sectors, setSectors] = useState<QuoteItem[] | null>(null);
  const [movers, setMovers] = useState<MoversData | null>(null);
  const [events, setEvents] = useState<WeeklyCalendar | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [status, setStatus] = useState("Initializing");
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const setLoad = (k: string, v: boolean) => setLoading((p) => ({ ...p, [k]: v }));
  const setErr = (k: string, v: string | null) => setErrors((p) => ({ ...p, [k]: v }));

  // Clock
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleString("en-US", {
          weekday: "short", month: "short", day: "numeric", year: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Fetchers ──
  const fetchMarkets = useCallback(async () => {
    setLoad("markets", true); setErr("markets", null);
    try { setMarkets(await fetchSection("markets")); }
    catch (e) { setErr("markets", (e as Error).message); }
    setLoad("markets", false);
  }, []);

  const fetchFX = useCallback(async () => {
    setLoad("fx", true); setErr("fx", null);
    try { setFx(await fetchSection("fx")); }
    catch (e) { setErr("fx", (e as Error).message); }
    setLoad("fx", false);
  }, []);

  const fetchSectors = useCallback(async () => {
    setLoad("sectors", true); setErr("sectors", null);
    try { setSectors(await fetchSection("sectors")); }
    catch (e) { setErr("sectors", (e as Error).message); }
    setLoad("sectors", false);
  }, []);

  const fetchMovers = useCallback(async () => {
    setLoad("movers", true); setErr("movers", null);
    try { setMovers(await fetchSection("movers")); }
    catch (e) { setErr("movers", (e as Error).message); }
    setLoad("movers", false);
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoad("events", true); setErr("events", null);
    try { setEvents(await fetchSection("events")); }
    catch (e) { setErr("events", (e as Error).message); }
    setLoad("events", false);
  }, []);

  const refreshAll = useCallback(async () => {
    setStatus("Fetching");
    await Promise.allSettled([fetchMarkets(), fetchFX(), fetchSectors(), fetchMovers(), fetchEvents()]);
    const t = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    setStatus(`Updated ${t}`);
  }, [fetchMarkets, fetchFX, fetchSectors, fetchMovers, fetchEvents]);

  // Fetch once on mount only — no auto-refresh
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      refreshAll();
    }
  }, [refreshAll]);

  const anyLoading = Object.values(loading).some(Boolean);

  const generateEmail = async () => {
    setLoad("email", true);
    try {
      const res = await fetch("/api/market-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "email", briefData: { markets, fx, sectors, movers, events } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setEmailDraft(json.data);
    } catch (e) {
      setEmailDraft(`Failed to generate email: ${(e as Error).message}`);
    }
    setLoad("email", false);
  };

  // Check if a day label is today
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "short", day: "numeric", timeZone: "America/New_York",
  });

  return (
    <>
      {/* ── Header ── */}
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
          <button className="btn btn-a" disabled={anyLoading || !markets} onClick={generateEmail}>
            {loading.email ? "Drafting…" : "✉ Email Brief"}
          </button>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="grid">
        {/* ── LEFT: Markets + FX ── */}
        <div className="col">
          <div className="sh">
            <span className="tg">Market Overview</span>
            <span className="ct">Polygon.io</span>
          </div>
          {loading.markets ? (
            <Skeleton rows={8} />
          ) : errors.markets ? (
            <div className="msg err-msg">⚠ {errors.markets}</div>
          ) : markets ? (
            markets.map((m) => <QuoteRow key={m.symbol} item={m} />)
          ) : null}

          <div className="sh">
            <span className="tg">FX, Dollar &amp; Crypto</span>
            <span className="ct">Yahoo Finance</span>
          </div>
          {loading.fx ? (
            <Skeleton rows={6} />
          ) : errors.fx ? (
            <div className="msg err-msg">⚠ {errors.fx}</div>
          ) : fx ? (
            fx.map((f) => <QuoteRow key={f.symbol} item={f} />)
          ) : null}

          <div className="sh">
            <span className="tg">IOT</span>
            <span className="ct">Samsara · TradingView</span>
          </div>
          <TVChart symbol="IOT" exchange="NYSE" height={400} />
        </div>

        {/* ── CENTER: Sectors + Calendar ── */}
        <div className="col">
          <div className="sh">
            <span className="tg">Sector ETFs</span>
            <span className="ct">Sorted by Performance</span>
          </div>
          {loading.sectors ? (
            <Skeleton rows={11} />
          ) : errors.sectors ? (
            <div className="msg err-msg">⚠ {errors.sectors}</div>
          ) : sectors ? (
            sectors.map((s) => (
              <SectorRow key={s.symbol} item={s} />
            ))
          ) : null}

          <div className="sh">
            <span className="tg">US Economic Calendar</span>
            <span className="ct">TradingView · This Week</span>
          </div>
          {loading.events ? (
            <Skeleton rows={6} />
          ) : errors.events ? (
            <div className="msg err-msg">⚠ {errors.events}</div>
          ) : events ? (
            Object.keys(events).length === 0 ? (
              <div className="msg">No high-importance US events this week</div>
            ) : (
              Object.entries(events).map(([day, dayEvents]) => (
                <div key={day}>
                  <div className={`cal-day-hdr ${day === todayLabel ? "cal-today" : ""}`}>
                    {day}
                    {day === todayLabel && <span className="cal-today-badge">TODAY</span>}
                  </div>
                  <div className="cal-table-hdr">
                    <span className="cal-col-event">Event</span>
                    <span className="cal-col">Act</span>
                    <span className="cal-col">Fcst</span>
                    <span className="cal-col">Prev</span>
                  </div>
                  {dayEvents.map((ev, i) => (
                    <div key={i} className={`cal-row ${ev.importance === "high" ? "cal-hi" : ""}`}>
                      <div className="cal-col-event">
                        <span className="cal-time">{ev.time}</span>
                        <span className="cal-name">{ev.event}</span>
                      </div>
                      <span className={`cal-col cal-val ${ev.actual ? "cal-act" : ""}`}>{ev.actual || "—"}</span>
                      <span className="cal-col cal-val">{ev.forecast || "—"}</span>
                      <span className="cal-col cal-val">{ev.previous || "—"}</span>
                    </div>
                  ))}
                </div>
              ))
            )
          ) : null}
        </div>

        {/* ── RIGHT: Movers ── */}
        <div className="col">
          <div className="sh">
            <span className="tg" style={{ color: "var(--grn)" }}>▲ Top Gainers</span>
            <span className="ct">SPY · QQQ · DIA</span>
          </div>
          {loading.movers ? (
            <Skeleton rows={8} />
          ) : errors.movers ? (
            <div className="msg err-msg">⚠ {errors.movers}</div>
          ) : movers?.gainers ? (
            movers.gainers.map((m, i) => (
              <div key={i} className="mover-row">
                <div>
                  <div className="mover-sym">{m.symbol}</div>
                  {m.name && <div className="mover-name">{m.name}</div>}
                </div>
                <div className="mover-right">
                  <span className="cg up">{fmtPct(m.pct)}</span>
                  <div className="mover-price">${fmtP(m.price)}</div>
                </div>
              </div>
            ))
          ) : null}

          <div className="sh">
            <span className="tg" style={{ color: "var(--red)" }}>▼ Top Losers</span>
            <span className="ct">SPY · QQQ · DIA</span>
          </div>
          {loading.movers ? (
            <Skeleton rows={8} />
          ) : movers?.losers ? (
            movers.losers.map((m, i) => (
              <div key={i} className="mover-row">
                <div>
                  <div className="mover-sym">{m.symbol}</div>
                  {m.name && <div className="mover-name">{m.name}</div>}
                </div>
                <div className="mover-right">
                  <span className="cg dn">{fmtPct(m.pct)}</span>
                  <div className="mover-price">${fmtP(m.price)}</div>
                </div>
              </div>
            ))
          ) : null}
        </div>
      </div>

      {/* ── Email Modal ── */}
      {emailDraft && (
        <div className="overlay" onClick={() => setEmailDraft(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
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
