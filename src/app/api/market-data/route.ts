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

// Stock/ETF snapshot → { price, chg, pct }
async function stockSnapshot(ticker: string) {
  const d = await pgFetch(`/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}`);
  const t = d?.ticker;
  if (!t) return null;
  return {
    price: t.day?.c || t.lastTrade?.p || t.prevDay?.c || 0,
    chg: t.todaysChange ?? 0,
    pct: t.todaysChangePerc ?? 0,
  };
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

// Forex snapshot
async function forexSnapshot(ticker: string) {
  const d = await pgFetch(`/v2/snapshot/locale/global/markets/forex/tickers/${ticker}`);
  const t = d?.ticker;
  if (!t) return null;
  const price = t.day?.c || t.lastQuote?.a || t.prevDay?.c || 0;
  const prev = t.prevDay?.c || 0;
  const chg = prev ? price - prev : 0;
  const pct = prev ? ((price - prev) / prev) * 100 : 0;
  return { price, chg, pct };
}

// Crypto snapshot
async function cryptoSnapshot(ticker: string) {
  const d = await pgFetch(`/v2/snapshot/locale/global/markets/crypto/tickers/${ticker}`);
  const t = d?.ticker;
  if (!t) return null;
  const price = t.day?.c || t.lastTrade?.p || t.prevDay?.c || 0;
  const prev = t.prevDay?.c || 0;
  const chg = prev ? price - prev : 0;
  const pct = prev ? ((price - prev) / prev) * 100 : 0;
  return { price, chg, pct };
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

// ── Index snapshots (for DXY) via indices endpoint ──────────────────────

async function indexSnapshot(ticker: string) {
  // Try the indices snapshot endpoint
  const d = await pgFetch(`/v3/snapshot/indices?ticker=${ticker}`);
  if (d?.results?.[0]) {
    const r = d.results[0];
    const price = r.value ?? r.session?.close ?? 0;
    const prev = r.session?.previous_close ?? 0;
    const chg = prev ? price - prev : (r.session?.change ?? 0);
    const pct = prev ? ((price - prev) / prev) * 100 : (r.session?.change_percent ?? 0);
    return { price, chg, pct };
  }
  return null;
}

// ── Econ calendar (Trading Economics free) ──────────────────────────────

async function fetchEconCalendar() {
  const d = new Date();
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const url = `https://api.tradingeconomics.com/calendar/country/united%20states/${ds}/${ds}?c=guest:guest&f=json`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("TE API error");
    const a = await r.json();
    if (!Array.isArray(a)) return [];
    return a
      .filter((e: Record<string, unknown>) => (e.Importance as number) >= 2 && e.Country === "United States")
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
        new Date(a.Date as string).getTime() - new Date(b.Date as string).getTime()
      )
      .map((e: Record<string, unknown>) => ({
        time: new Date(e.Date as string).toLocaleTimeString("en-US", {
          hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/New_York",
        }) + " ET",
        event: e.Event,
        actual: e.Actual || null,
        forecast: e.Forecast || null,
        previous: e.Previous || null,
        importance: (e.Importance as number) >= 3 ? "high" : "medium",
      }));
  } catch {
    return [];
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
  if (!POLYGON_KEY) {
    return NextResponse.json({ error: "POLYGON_API_KEY not configured" }, { status: 500 });
  }

  const { section } = await req.json();

  switch (section) {
    case "markets": {
      // Batch fetch market overview ETFs
      const tickers = MARKET_TICKERS.map((t) => t.symbol);
      const snaps = await stockSnapshots(tickers);
      const data = MARKET_TICKERS.map((t) => ({
        ...t,
        ...(snaps[t.symbol] || { price: 0, chg: 0, pct: 0 }),
      }));
      return NextResponse.json({ data });
    }

    case "fx": {
      const [usdjpy, dxy, btc] = await Promise.all([
        forexSnapshot("C:USDJPY"),
        indexSnapshot("I:DXY"),
        cryptoSnapshot("X:BTCUSD"),
      ]);
      const data = [
        { symbol: "USD/JPY", name: "Japanese Yen", ...(usdjpy || { price: 0, chg: 0, pct: 0 }) },
        { symbol: "DXY", name: "Dollar Index", ...(dxy || { price: 0, chg: 0, pct: 0 }) },
        { symbol: "BTC/USD", name: "Bitcoin", ...(btc || { price: 0, chg: 0, pct: 0 }) },
      ];
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

    case "events": {
      const data = await fetchEconCalendar();
      return NextResponse.json({ data });
    }

    case "email": {
      // Claude-powered email generation (optional — requires ANTHROPIC_API_KEY)
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        return NextResponse.json({ error: "ANTHROPIC_API_KEY not set — email generation unavailable" }, { status: 400 });
      }
      const { briefData } = await req.json();
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

    default:
      return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  }
}
