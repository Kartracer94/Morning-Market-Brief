import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();
const MODEL = "claude-sonnet-4-20250514";

async function askClaude(prompt: string, systemPrompt: string): Promise<string | null> {
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: "user", content: prompt }],
      // @ts-expect-error — web_search tool type not yet in SDK typings
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    });
    const textBlocks = (res.content || [])
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text);
    return textBlocks.join("\n");
  } catch (e) {
    console.error("Claude API error:", e);
    return null;
  }
}

function parseJSON(text: string | null) {
  if (!text) return null;
  try {
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const startBrace = cleaned.indexOf("{");
    const startBracket = cleaned.indexOf("[");
    const start = Math.min(
      startBrace === -1 ? Infinity : startBrace,
      startBracket === -1 ? Infinity : startBracket
    );
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start === Infinity || end === -1) return null;
    return JSON.parse(cleaned.substring(start, end + 1));
  } catch (e) {
    console.error("JSON parse error:", e);
    return null;
  }
}

const PROMPTS: Record<string, { prompt: string; system: string }> = {
  futures: {
    prompt: `Search for the current/latest prices and daily percentage changes for these futures/assets: NQ=F (Nasdaq 100), ES=F (S&P 500), CL=F (Crude Oil), GC=F (Gold), BTC-USD (Bitcoin).
Return ONLY a JSON array like:
[{"symbol":"NQ=F","price":19500.25,"change_pct":-0.45}]
Include all 5 symbols. Use the most recent data you can find.`,
    system: "You are a financial data assistant. Use web search to find the latest market data. Return ONLY valid JSON array, no markdown, no explanation.",
  },
  fx: {
    prompt: `Search for the latest USD/JPY exchange rate and the US Dollar Index (DXY) value and their daily percentage changes.
Return ONLY a JSON array like:
[{"symbol":"USD/JPY","price":149.50,"change_pct":0.12},{"symbol":"DXY","price":104.25,"change_pct":-0.08}]`,
    system: "You are a financial data assistant. Use web search to find the latest FX data. Return ONLY valid JSON array, no markdown, no explanation.",
  },
  sectors: {
    prompt: `Search for the latest daily percentage change for these State Street sector ETFs: XLB, XLC, XLE, XLF, XLI, XLK, XLP, XLRE, XLU, XLV, XLY.
Return ONLY a JSON array like:
[{"symbol":"XLF","price":42.50,"change_pct":0.85}]
Include all 11 ETFs.`,
    system: "You are a financial data assistant. Use web search to find the latest ETF data. Return ONLY valid JSON array, no markdown, no explanation.",
  },
  movers: {
    prompt: `Search for the biggest mid-cap and large-cap US stock gainers and losers from overnight/pre-market or the most recent trading session.
Return ONLY a JSON object like:
{"gainers":[{"symbol":"AAPL","name":"Apple Inc","change_pct":5.2,"price":180.50,"reason":"Beat earnings"}],"losers":[{"symbol":"TSLA","name":"Tesla Inc","change_pct":-4.1,"price":220.30,"reason":"Missed revenue"}]}
Include 5-8 gainers and 5-8 losers. Only stocks with market cap above $2B. Include a brief reason if available.`,
    system: "You are a financial data assistant. Use web search to find the latest stock movers. Return ONLY valid JSON, no markdown, no explanation.",
  },
  events: {
    prompt: `Search tradingeconomics.com/calendar for today's US economic calendar events. I only want HIGH IMPORTANCE US economic events (importance level 3). These are major releases like CPI, NFP, FOMC, GDP, ISM, etc.
Return ONLY a JSON array like:
[{"time":"8:30 AM ET","event":"CPI MoM","forecast":"0.3%","previous":"0.2%","actual":"0.4%","importance":"high"}]
If there are no high-importance US events today, return an empty array [].`,
    system: "You are a financial data assistant. Use web search to find today's economic calendar. Return ONLY valid JSON array, no markdown, no explanation.",
  },
  email: {
    prompt: "", // filled dynamically
    system: "You are a senior market strategist writing a morning brief email. Be concise, professional, and insightful. Focus on what matters.",
  },
};

export async function POST(req: NextRequest) {
  const { section, briefData } = await req.json();

  if (section === "email" && briefData) {
    const raw = await askClaude(
      `Given this morning market brief data, compose a concise plain-text email summary suitable for a daily morning brief. Use the format of a professional trading desk morning note. Be concise and highlight only the most important moves and themes. Data: ${JSON.stringify(briefData)}
Return the email body as plain text (not JSON). Start with a one-line market summary, then sections for Futures, FX, Sector Performance, Notable Movers, and Economic Calendar. Keep it under 400 words.`,
      PROMPTS.email.system
    );
    return NextResponse.json({ data: raw });
  }

  const config = PROMPTS[section];
  if (!config) {
    return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  }

  const raw = await askClaude(config.prompt, config.system);
  const parsed = parseJSON(raw);

  if (!parsed) {
    return NextResponse.json({ error: `Could not fetch ${section} data` }, { status: 500 });
  }

  return NextResponse.json({ data: parsed });
}
