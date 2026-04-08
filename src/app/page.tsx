"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import "./globals.css";

// ── Types ──
interface QuoteItem { symbol: string; name: string; price: number; chg: number; pct: number }
interface Mover { symbol: string; price: number; chg: number; pct: number }
interface MoversData { gainers: Mover[]; losers: Mover[] }
interface EconEvent { time: string; event: string; estimate?: string | null; consensus?: string | null; previous?: string | null; actual?: string | null; importance: string }
type WeeklyCalendar = Record<string, EconEvent[]>;

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
            sectors.map((s) => {
              const pct = s.pct || 0;
              const barW = Math.min(Math.abs(pct) * 20, 100);
              const isPos = pct >= 0;
              return (
                <div key={s.symbol} className="sector-row">
                  <span className="sector-sym">{s.symbol}</span>
                  <span className="sector-name">{s.name}</span>
                  <div className="sector-bar-wrap">
                    <div
                      className="sector-bar"
                      style={{
                        width: `${barW}%`,
                        background: isPos ? "var(--grn)" : "var(--red)",
                        opacity: 0.35,
                        [isPos ? "left" : "right"]: 0,
                      }}
                    />
                  </div>
                  <span className="sector-pct" style={{ color: isPos ? "var(--grn)" : "var(--red)" }}>
                    {fmtPct(s.pct)}
                  </span>
                </div>
              );
            })
          ) : null}

          <div className="sh">
            <span className="tg">US Economic Calendar</span>
            <span className="ct">This Week · High Importance</span>
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
                  {dayEvents.map((ev, i) => (
                    <div key={i} className={`ev ${ev.importance === "high" ? "hi" : ""}`}>
                      <div className="t">{ev.time}</div>
                      <div className="ti">{ev.event}</div>
                      <div className="vl">
                        <span>Act: <b>{ev.actual || "—"}</b></span>
                        <span>Est: <b>{ev.estimate || "—"}</b></span>
                        <span>Cons: <b>{ev.consensus || "—"}</b></span>
                        <span>Prev: <b>{ev.previous || "—"}</b></span>
                      </div>
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
            <span className="ct">Polygon.io</span>
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
            <span className="ct">Polygon.io</span>
          </div>
          {loading.movers ? (
            <Skeleton rows={8} />
          ) : movers?.losers ? (
            movers.losers.map((m, i) => (
              <div key={i} className="mover-row">
                <div>
                  <div className="mover-sym">{m.symbol}</div>
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
