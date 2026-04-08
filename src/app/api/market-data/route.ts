import { NextRequest, NextResponse } from "next/server";

const PG = "https://api.polygon.io";
const POLYGON_KEY = process.env.POLYGON_API_KEY || "";

// ── Polygon helpers ─────────────────────────────────────────────────────

async function pgFetch(path: string) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${PG}${path}${sep}apiKey=${POLYGON_KEY}`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    console.error(`Polygon ${path}: ${res.status} ${res.statusText}`);
    return null;
  }
  return res.json();
}

// Batch stock snapshots
async function stockSnapshots(tickers: string[]) {
  const d = await pgFetch(`/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(",")}`);
  if (!d?.tickers) return {};
  const map: Record<string, { price: number; chg: number; pct: number }> = {};
  for (const t of d.tickers) {
    map[t.ticker] = {
      price: t.day?.c || t.lastTrade?.p || t.prevDay?.c || 0,
      chg: t.todaysChange ?? 0,
      pct: t.todaysChangePerc ?? 0,
    };
  }
  return map;
}

// Gainers / Losers
async function fetchMovers(direction: "gainers" | "losers") {
  const d = await pgFetch(`/v2/snapshot/locale/us/markets/stocks/${direction}`);
  if (!d?.tickers) return [];
  return d.tickers.slice(0, 8).map((t: Record<string, unknown>) => ({
    symbol: t.ticker,
    price: (t.day as Record<string, number>)?.c || (t.lastTrade as Record<string, number>)?.p || 0,
    chg: (t as Record<string, number>).todaysChange ?? 0,
    pct: (t as Record<string, number>).todaysChangePerc ?? 0,
  }));
}

// ── Yahoo Finance v8 chart API for FX, DXY, Crypto ─────────────────────

const FX_SYMBOLS = [
  { symbol: "USD/JPY", name: "Japanese Yen", yahoo: "USDJPY=X" },
  { symbol: "EUR/USD", name: "Euro", yahoo: "EURUSD=X" },
  { symbol: "GBP/USD", name: "British Pound", yahoo: "GBPUSD=X" },
  { symbol: "DXY", name: "Dollar Index", yahoo: "DX-Y.NYB" },
  { symbol: "BTC/USD", name: "Bitcoin", yahoo: "BTC-USD" },
  { symbol: "ETH/USD", name: "Ethereum", yahoo: "ETH-USD" },
];

async function yahooChartQuote(ticker: string) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=2d&interval=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice ?? 0;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? 0;
    const chg = prev ? price - prev : 0;
    const pct = prev ? ((price - prev) / prev) * 100 : 0;
    return { price, chg, pct };
  } catch {
    return null;
  }
}

async function fetchFXQuotes() {
  const results = await Promise.all(FX_SYMBOLS.map((s) => yahooChartQuote(s.yahoo)));
  return FX_SYMBOLS.map((s, i) => ({
    ...s,
    ...(results[i] || { price: 0, chg: 0, pct: 0 }),
  }));
}

// ── Econ calendar — Forex Factory, full week, grouped by day ────────────

interface FFEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
  actual?: string;
}

async function fetchWeeklyEconCalendar() {
  try {
    const r = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error("FF API error");
    const events: FFEvent[] = await r.json();
    if (!Array.isArray(events)) return {};

    // Filter to US (USD) events, medium + high impact
    const filtered = events
      .filter((e) => e.country === "USD" && (e.impact === "High" || e.impact === "Medium"))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Group by day
    const grouped: Record<string, {
      time: string;
      event: string;
      actual: string | null;
      forecast: string | null;
      previous: string | null;
      importance: string;
    }[]> = {};

    for (const e of filtered) {
      const d = new Date(e.date);
      const dateKey = d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      });
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push({
        time: d.toLocaleTimeString("en-US", {
          hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/New_York",
        }) + " ET",
        event: e.title,
        actual: e.actual || null,
        forecast: e.forecast || null,
        previous: e.previous || null,
        importance: e.impact === "High" ? "high" : "medium",
      });
    }

    return grouped;
  } catch (err) {
    console.error("Forex Factory calendar error:", err);
    return {};
  }
}

// ── Route handler ───────────────────────────────────────────────────────

const MARKET_TICKERS = [
  { symbol: "SPY", name: "S&P 500" },
  { symbol: "QQQ", name: "Nasdaq 100" },
  { symbol: "DIA", name: "Dow Jones" },
  { symbol: "IWM", name: "Russell 2000" },
  { symbol: "GLD", name: "Gold" },
  { symbol: "USO", name: "Crude Oil" },
  { symbol: "TLT", name: "20Y Treasury" },
  { symbol: "VIX", name: "Volatility" },
];

const SECTOR_TICKERS = [
  { symbol: "XLK", name: "Technology" },
  { symbol: "XLF", name: "Financials" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLV", name: "Health Care" },
  { symbol: "XLI", name: "Industrials" },
  { symbol: "XLY", name: "Consumer Disc." },
  { symbol: "XLP", name: "Consumer Staples" },
  { symbol: "XLC", name: "Comm. Services" },
  { symbol: "XLU", name: "Utilities" },
  { symbol: "XLB", name: "Materials" },
  { symbol: "XLRE", name: "Real Estate" },
];

export async function POST(req: NextRequest) {
  const { section, briefData } = await req.json();

  // FX via Yahoo v8 chart API (no key needed)
  if (section === "fx") {
    const data = await fetchFXQuotes();
    return NextResponse.json({ data });
  }

  // Econ calendar doesn't need Polygon key
  if (section === "events") {
    const data = await fetchWeeklyEconCalendar();
    return NextResponse.json({ data });
  }

  // Email generation (optional — requires ANTHROPIC_API_KEY)
  if (section === "email" && briefData) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not set — email generation unavailable" }, { status: 400 });
    }
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic();
      const res = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: "You are a senior market strategist writing a morning brief email. Be concise, professional, and insightful.",
        messages: [{
          role: "user",
          content: `Given this morning market brief data, compose a concise plain-text email summary suitable for a daily morning brief. Professional trading desk style. Under 400 words. Data: ${JSON.stringify(briefData)}`,
        }],
      });
      const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
      return NextResponse.json({ data: text });
    } catch (e) {
      console.error("Claude email error:", e);
      return NextResponse.json({ error: "Failed to generate email" }, { status: 500 });
    }
  }

  // Everything else needs Polygon
  if (!POLYGON_KEY) {
    return NextResponse.json({ error: "POLYGON_API_KEY not configured" }, { status: 500 });
  }

  switch (section) {
    case "markets": {
      const tickers = MARKET_TICKERS.map((t) => t.symbol);
      const snaps = await stockSnapshots(tickers);
      const data = MARKET_TICKERS.map((t) => ({
        ...t,
        ...(snaps[t.symbol] || { price: 0, chg: 0, pct: 0 }),
      }));
      return NextResponse.json({ data });
    }

    case "sectors": {
      const tickers = SECTOR_TICKERS.map((t) => t.symbol);
      const snaps = await stockSnapshots(tickers);
      const data = SECTOR_TICKERS.map((t) => ({
        ...t,
        ...(snaps[t.symbol] || { price: 0, chg: 0, pct: 0 }),
      })).sort((a, b) => b.pct - a.pct);
      return NextResponse.json({ data });
    }

    case "movers": {
      const [gainers, losers] = await Promise.all([
        fetchMovers("gainers"),
        fetchMovers("losers"),
      ]);
      return NextResponse.json({ data: { gainers, losers } });
    }

    default:
      return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  }
}
