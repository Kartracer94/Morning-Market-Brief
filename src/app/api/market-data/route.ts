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
      price: t.min?.c || t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0,
      chg: t.todaysChange ?? 0,
      pct: t.todaysChangePerc ?? 0,
    };
  }
  return map;
}

// ── Index constituents (SPY + QQQ + DIA) ────────────────────────────────

const INDEX_CONSTITUENTS = new Set([
  "AAPL","ABBV","ABNB","ABT","ACN","ADBE","ADI","ADM","ADP","ADSK","AEE","AEP","AES","AFL","AIG",
  "AIZ","AJG","AKAM","ALB","ALGN","ALK","ALL","ALLE","AMAT","AMCR","AMD","AME","AMGN","AMP","AMT",
  "AMZN","ANET","ANSS","AON","AOS","APA","APD","APH","APP","APTV","ARE","ARM","ASML","ATO","AVGO",
  "AVY","AWK","AXP","AZN","AZO","BA","BAC","BAX","BBWI","BBY","BDX","BEN","BIIB","BIO","BK",
  "BKNG","BKR","BLDR","BLK","BMY","BR","BRO","BSX","BWA","BXP","C","CAG","CAH","CARR",
  "CAT","CB","CBOE","CBRE","CCI","CCL","CDAY","CDNS","CDW","CE","CEG","CF","CFG","CHD","CHRW",
  "CHTR","CI","CINF","CL","CLX","CMA","CMCSA","CME","CMG","CMI","CMS","CNC","CNP","COF","COIN",
  "COO","COP","COST","CPAY","CPB","CPRT","CPT","CRL","CRM","CRWD","CSCO","CSGP","CSX","CTAS","CTRA",
  "CTSH","CTVA","CVS","CVX","CZR","D","DAL","DASH","DAY","DD","DDOG","DE","DECK","DFS","DG",
  "DGX","DHI","DHR","DIS","DLTR","DOV","DOW","DPZ","DRI","DTE","DUK","DVA","DVN","DXCM","EA",
  "EBAY","ECL","ED","EFX","EIX","EL","EMN","EMR","ENPH","EOG","EPAM","EQIX","EQR","EQT","ES",
  "ESS","ETN","ETR","EVRG","EW","EXC","EXPD","EXPE","EXR","F","FANG","FAST","FBIN","FCX","FDS",
  "FDX","FE","FFIV","FI","FICO","FIS","FISV","FITB","FMC","FOX","FOXA","FRT","FSLR","FTNT","FTV",
  "GD","GDDY","GE","GEHC","GEN","GFS","GILD","GIS","GL","GLW","GM","GNRC","GOOG","GOOGL","GPC",
  "GPN","GRMN","GS","GWW","HAL","HAS","HBAN","HCA","HD","HOLX","HON","HPE","HPQ","HRL","HSIC",
  "HST","HSY","HUBB","HUM","HWM","IBM","ICE","IDXX","IEX","IFF","ILMN","INCY","INTC","INTU","INVH",
  "IP","IPG","IQV","IR","IRM","ISRG","IT","ITW","IVZ","J","JBHT","JBL","JCI","JKHY","JNJ",
  "JNPR","JPM","K","KDP","KEY","KEYS","KHC","KIM","KLAC","KMB","KMI","KMX","KO","KR","KVUE",
  "L","LDOS","LEN","LH","LHX","LIN","LKQ","LLY","LMT","LNT","LOW","LRCX","LULU","LUV","LVS",
  "LW","LYB","LYV","MA","MAA","MAR","MAS","MCD","MCHP","MCK","MCO","MDB","MDLZ","MDT","MELI",
  "MET","META","MGM","MHK","MKC","MKTX","MLM","MMC","MMM","MNST","MO","MOH","MOS","MPC","MPWR",
  "MRK","MRNA","MRO","MRVL","MS","MSCI","MSFT","MSI","MTB","MTCH","MTD","MU","NCLH","NDAQ","NDSN",
  "NEE","NEM","NFLX","NI","NKE","NOC","NOW","NRG","NSC","NTAP","NTRS","NUE","NVDA","NVR","NWS",
  "NWSA","NXPI","O","ODFL","OGN","OKE","OMC","ON","ORCL","ORLY","OTIS","OXY","PANW","PAYC","PAYX",
  "PCAR","PCG","PDD","PEG","PEP","PFE","PFG","PG","PGR","PH","PHM","PKG","PLD","PLTR","PM",
  "PNC","PNR","PNW","PODD","POOL","PPG","PPL","PRU","PSA","PSX","PTC","PVH","PWR","PYPL","QCOM",
  "QRVO","RCL","RE","REG","REGN","RF","RHI","RJF","RL","RMD","ROK","ROL","ROP","ROST","RSG",
  "RTX","RVTY","SBAC","SBUX","SCHW","SEE","SHW","SJM","SLB","SMCI","SNA","SNPS","SO","SPG","SPGI",
  "SRE","STE","STLD","STT","STX","STZ","SWK","SWKS","SYF","SYK","SYY","T","TAP","TDG","TDY",
  "TEAM","TECH","TEL","TER","TFC","TFX","TGT","TJX","TMO","TMUS","TPR","TRGP","TRMB","TROW","TRV",
  "TSCO","TSLA","TSN","TT","TTD","TTWO","TXN","TXT","TYL","UAL","UDR","UHS","ULTA","UNH","UNP",
  "UPS","URI","USB","V","VICI","VLO","VLTO","VMC","VRSK","VRSN","VRTX","VST","VTR","VTRS","VZ",
  "WAB","WAT","WBA","WBD","WDAY","WDC","WEC","WELL","WFC","WHR","WM","WMB","WMT","WRB","WRK",
  "WST","WTW","WY","WYNN","XEL","XOM","XRAY","XYL","YUM","ZBH","ZBRA","ZION","ZS","ZTS",
]);

// Gainers / Losers — filtered to SPY + QQQ + DIA constituents
async function fetchIndexMovers() {
  const d = await pgFetch("/v2/snapshot/locale/us/markets/stocks/tickers");
  if (!d?.tickers) return { gainers: [], losers: [] };

  interface TickerSnap { ticker: string; todaysChange: number; todaysChangePerc: number; min?: { c: number }; day?: { c: number }; lastTrade?: { p: number }; prevDay?: { c: number } }

  const filtered = (d.tickers as TickerSnap[]).filter((t) => INDEX_CONSTITUENTS.has(t.ticker));

  const sorted = [...filtered].sort((a, b) => (b.todaysChangePerc ?? 0) - (a.todaysChangePerc ?? 0));

  const toMover = (t: TickerSnap) => ({
    symbol: t.ticker,
    price: t.min?.c || t.lastTrade?.p || t.day?.c || t.prevDay?.c || 0,
    chg: t.todaysChange ?? 0,
    pct: t.todaysChangePerc ?? 0,
  });

  const gainers = sorted.slice(0, 10).map(toMover);
  const losers = sorted.slice(-10).reverse().map(toMover);

  return { gainers, losers };
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

// ── Econ calendar — TradingView, full week, with actuals ────────────────

interface TVEconEvent {
  title: string;
  date: string;
  actual: number | string | null;
  forecast: number | string | null;
  previous: number | string | null;
  actualRaw: number | null;
  forecastRaw: number | null;
  previousRaw: number | null;
  importance: number; // -1=unrated, 0=low, 1=medium/high (varies)
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const saturday = new Date(monday);
  saturday.setDate(monday.getDate() + 6);
  return {
    from: monday.toISOString(),
    to: saturday.toISOString(),
  };
}

async function fetchWeeklyEconCalendar() {
  const { from, to } = getWeekRange();
  const url = `https://economic-calendar.tradingview.com/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&countries=US`;
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Origin": "https://www.tradingview.com",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`TV calendar ${r.status}`);
    const data = await r.json();
    const events: TVEconEvent[] = data?.result ?? (Array.isArray(data) ? data : []);

    // Filter to medium + high importance (importance >= 0)
    const filtered = events
      .filter((e) => e.importance >= 0)
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

      const fmt = (v: number | string | null | undefined) => {
        if (v == null || v === "") return null;
        return String(v);
      };

      grouped[dateKey].push({
        time: d.toLocaleTimeString("en-US", {
          hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "America/New_York",
        }) + " ET",
        event: e.title,
        actual: fmt(e.actual),
        forecast: fmt(e.forecast),
        previous: fmt(e.previous),
        importance: e.importance >= 1 ? "high" : "medium",
      });
    }

    return grouped;
  } catch (err) {
    console.error("TradingView calendar error:", err);
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
      const data = await fetchIndexMovers();
      return NextResponse.json({ data });
    }

    default:
      return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  }
}
