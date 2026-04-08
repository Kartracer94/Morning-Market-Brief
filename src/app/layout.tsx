import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Morning Market Brief",
  description: "Live morning market dashboard — futures, FX, sectors, movers & economic calendar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#06080c" }}>{children}</body>
    </html>
  );
}
