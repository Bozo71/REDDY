import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/logo-preview")({
  component: LogoPreview,
  // Interna alatka za logo — nema šta da traži u pretrazi.
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
});

/**
 * Pure-SVG version of the splash logo (no <foreignObject> so it rasterizes
 * reliably to PNG via canvas on mobile browsers).
 *
 * variant="original" → yellow square + dark R + white/yellow wordmark
 * variant="white"    → solid white square with R cut out + white wordmark
 *                      (designed to sit on dark backgrounds)
 */
function buildLogoSvg(variant: "splash" | "yellow"): string {
  const W = 600;
  const H = 720;

  const sq = { cx: 300, cy: 270, size: 240, rx: 56 };
  const sqX = sq.cx - sq.size / 2;
  const sqY = sq.cy - sq.size / 2;

  const fontStack = "Nunito, 'Nunito Sans', Inter, system-ui, sans-serif";

  // Splash background = plum-gradient (#2B2640 → #1C1829, 140deg)
  // Yellow background = sunshine-gradient (#FFD86B → #FFC93C → #FFB200, 135deg)
  const bg =
    variant === "splash"
      ? `<defs>
    <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W * Math.cos((140 * Math.PI) / 180)}" y2="${H * Math.sin((140 * Math.PI) / 180)}">
      <stop offset="0%" stop-color="#2B2640"/>
      <stop offset="100%" stop-color="#1C1829"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>`
      : `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFD86B"/>
      <stop offset="55%" stop-color="#FFC93C"/>
      <stop offset="100%" stop-color="#FFB200"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>`;

  // Tile colors: on yellow bg, keep yellow tile (slightly deeper so it reads)
  const tileTop = variant === "splash" ? "#FFD86B" : "#FFB200";
  const tileMid = variant === "splash" ? "#FFC93C" : "#FF9F00";
  const tileBot = variant === "splash" ? "#FFB200" : "#E68A00";
  const subtitleColor = variant === "splash" ? "#FFC93C" : "#1C1829";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="REDDY Elite Service">
  ${bg}
  <defs>
    <linearGradient id="tile-${variant}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${tileTop}"/>
      <stop offset="55%" stop-color="${tileMid}"/>
      <stop offset="100%" stop-color="${tileBot}"/>
    </linearGradient>
    <filter id="sh-${variant}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <g transform="rotate(8 ${sq.cx} ${sq.cy})" filter="url(#sh-${variant})">
    <rect x="${sqX}" y="${sqY}" width="${sq.size}" height="${sq.size}" rx="${sq.rx}" fill="url(#tile-${variant})"/>
  </g>
  <g transform="rotate(-3 ${sq.cx} ${sq.cy})">
    <rect x="${sqX}" y="${sqY}" width="${sq.size}" height="${sq.size}" rx="${sq.rx}" fill="#ffffff" fill-opacity="0.10"/>
  </g>
  <text x="${sq.cx}" y="${sq.cy + 12}" text-anchor="middle" dominant-baseline="middle"
    font-family="${fontStack}" font-weight="900" font-size="200"
    letter-spacing="-12" fill="#1C1829">R</text>
  <text x="${sq.cx}" y="500" text-anchor="middle"
    font-family="${fontStack}" font-weight="900" font-size="62"
    letter-spacing="18" fill="#FFFFFF">REDDY</text>
  <text x="${sq.cx}" y="556" text-anchor="middle"
    font-family="${fontStack}" font-weight="700" font-size="24"
    letter-spacing="9" fill="${subtitleColor}">ELITE SERVICE</text>
</svg>`;
}

async function svgToPngBlob(svg: string, scale = 3): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load SVG"));
      img.src = url;
    });
    const w = (img.naturalWidth || 600) * scale;
    const h = (img.naturalHeight || 720) * scale;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function LogoPreview() {
  const [busy, setBusy] = useState<string | null>(null);

  const splashSvg = useMemo(() => buildLogoSvg("splash"), []);
  const yellowSvg = useMemo(() => buildLogoSvg("yellow"), []);
  const splashUrl = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(splashSvg)}`,
    [splashSvg],
  );
  const yellowUrl = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(yellowSvg)}`,
    [yellowSvg],
  );

  const downloadPng = async (variant: "splash" | "yellow") => {
    try {
      setBusy(variant);
      const svg = variant === "splash" ? splashSvg : yellowSvg;
      const blob = await svgToPngBlob(svg, 3);
      triggerDownload(
        blob,
        variant === "splash" ? "reddy-logo-splash.png" : "reddy-logo-yellow.png",
      );
    } catch (err) {
      console.error(err);
      alert("PNG export failed. Long-press the image and choose 'Save Image' instead.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F5F1E6",
        padding: "24px 16px 48px",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#1F1030",
      }}
    >
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <header style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            REDDY Logo — Save to Gallery
          </h1>
          <p style={{ margin: "6px 0 0", opacity: 0.7, fontSize: 13, lineHeight: 1.5 }}>
            Long-press a logo and choose <strong>Save Image</strong> /{" "}
            <strong>Save to Photos</strong>. Or use the PNG download buttons.
          </p>
        </header>

        {/* LOGO 1 — exact Splash screen background (plum gradient) */}
        <section style={{ ...cardBase, background: "#F5F1E6" }}>
          <div style={{ ...labelStyle, color: "#1F1030" }}>1 · Splash screen logo</div>
          <img
            src={splashUrl}
            alt="REDDY Elite Service — splash screen logo"
            draggable
            style={{ width: "100%", maxWidth: 420, height: "auto", display: "block", borderRadius: 18 }}
          />
          <button
            onClick={() => downloadPng("splash")}
            disabled={busy === "splash"}
            style={{ ...primaryBtn, marginTop: 18, width: "100%", maxWidth: 420 }}
          >
            {busy === "splash" ? "Preparing PNG…" : "⬇  Download Splash PNG"}
          </button>
        </section>

        {/* LOGO 2 — REDDY signature yellow background */}
        <section style={{ ...cardBase, background: "#F5F1E6" }}>
          <div style={{ ...labelStyle, color: "#1F1030" }}>2 · Signature yellow background</div>
          <img
            src={yellowUrl}
            alt="REDDY Elite Service — yellow background"
            draggable
            style={{ width: "100%", maxWidth: 420, height: "auto", display: "block", borderRadius: 18 }}
          />
          <button
            onClick={() => downloadPng("yellow")}
            disabled={busy === "yellow"}
            style={{ ...primaryBtn, marginTop: 18, width: "100%", maxWidth: 420 }}
          >
            {busy === "yellow" ? "Preparing PNG…" : "⬇  Download Yellow PNG"}
          </button>
        </section>


        <p style={{ marginTop: 18, fontSize: 12, opacity: 0.6, textAlign: "center" }}>
          Transparent PNG · 1800×2160 px · Isolated at <code>/logo-preview</code>
        </p>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: "uppercase",
  marginBottom: 14,
  opacity: 0.85,
  alignSelf: "flex-start",
};

const cardBase: React.CSSProperties = {
  borderRadius: 20,
  padding: 20,
  marginBottom: 16,
  boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const primaryBtn: React.CSSProperties = {
  background: "linear-gradient(135deg,#FFD86B,#FFC93C 55%,#FFB200)",
  color: "#2B2640",
  border: "none",
  borderRadius: 999,
  padding: "14px 22px",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(255,178,0,0.35)",
};

const whiteBtn: React.CSSProperties = {
  background: "#FFFFFF",
  color: "#1C1829",
  border: "none",
  borderRadius: 999,
  padding: "14px 22px",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(255,255,255,0.18)",
};
