# Morning Market Brief

A live morning market dashboard built with Next.js, powered by Claude AI with web search for real-time market data.

## Features

- **Futures** — NQ, ES, CL, GC, BTC with TradingView charts + AI-fetched prices
- **FX & Dollar** — USD/JPY, DXY with live TradingView widget
- **Sector ETFs** — All 11 SPDR sectors sorted by performance with bar visualization
- **Notable Movers** — Top gainers and losers (mid/large cap) with reasons
- **Economic Calendar** — High-importance US events for the day
- **Email Brief** — Generate a professional morning brief email draft with one click

## Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file with your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=your_key_here
   ```

3. Run the dev server:
   ```bash
   npm run dev
   ```

## Deploy to Vercel

1. Push to GitHub
2. Import the repo in [Vercel](https://vercel.com/new)
3. Add `ANTHROPIC_API_KEY` as an environment variable
4. Deploy

## Tech Stack

- Next.js 15 (App Router)
- Claude API with web search for market data
- TradingView widgets for live charts
- Dark terminal-style UI
