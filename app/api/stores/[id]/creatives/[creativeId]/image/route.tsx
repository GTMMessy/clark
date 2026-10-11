import { ImageResponse } from "next/og";
import { db } from "@/lib/db";

export const maxDuration = 60;

// Display fonts for ad artwork, matched to the storefront's heading font.
const FONT_FILES: Record<string, string> = {
  playfair_display_n7: "playfair-display@latest/latin-700-normal.ttf",
  cormorant_n6: "cormorant@latest/latin-600-normal.ttf",
  fraunces_n6: "fraunces@latest/latin-600-normal.ttf",
  dm_serif_display_n4: "dm-serif-display@latest/latin-400-normal.ttf",
  libre_baskerville_n7: "libre-baskerville@latest/latin-700-normal.ttf",
  bodoni_moda_n6: "bodoni-moda@latest/latin-600-normal.ttf",
  abril_fatface_n4: "abril-fatface@latest/latin-400-normal.ttf",
  josefin_sans_n6: "josefin-sans@latest/latin-600-normal.ttf",
  montserrat_n7: "montserrat@latest/latin-700-normal.ttf",
  space_grotesk_n7: "space-grotesk@latest/latin-700-normal.ttf",
  syne_n7: "syne@latest/latin-700-normal.ttf",
  anton_n4: "anton@latest/latin-400-normal.ttf",
  archivo_n7: "archivo@latest/latin-700-normal.ttf",
  inter_n7: "inter@latest/latin-700-normal.ttf",
};

// The image renderer cannot fetch remote photos reliably, so the photo is inlined. The resized copy is
// tried first; Arcade's full-size original is the fallback.
async function loadPhoto(...urls: string[]): Promise<string> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { Accept: "image/png,image/jpeg" } });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !/image\/(png|jpeg)/.test(type)) continue;
      return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
    } catch {}
  }
  return "";
}

const font = async (file: string) =>
  (await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/${file}`)).arrayBuffer();

// Renders one ad as a finished 1080x1080 image: the product photo set in the brand's colours and type.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; creativeId: string }> }) {
  const { id, creativeId } = await params;
  const [meta, ads] = await Promise.all([db.getMeta(id), db.getAds(id)]);
  // Browser ad blockers hide anything whose address mentions ads, so the address uses the product id.
  const ad = ads.find((a) => a.id === `ad-${creativeId}`);
  if (!meta || !ad) return new Response("Not found", { status: 404 });

  const palette = meta.proposal?.palette ?? {
    background: "#ffffff",
    foreground: "#1f1d18",
    accent: "#7a7854",
    muted: "#dddbd2",
  };
  const brand = meta.proposal?.name ?? "";
  const origin = new URL(req.url).origin;
  const [photo, display, label] = await Promise.all([
    loadPhoto(`${origin}/_next/image?url=${encodeURIComponent(ad.imageUrl)}&w=1080&q=80`, ad.imageUrl),
    font(FONT_FILES[meta.headingFont ?? ""] ?? FONT_FILES.playfair_display_n7),
    font("jetbrains-mono@latest/latin-500-normal.ttf"),
  ]);

  const small = { fontFamily: "label", fontSize: 26, letterSpacing: 5, textTransform: "uppercase" as const };
  const cta = (background: string, color: string) => (
    <div style={{ ...small, display: "flex", background, color, padding: "20px 34px", alignSelf: "flex-start" }}>
      {ad.cta ?? "Shop now"}
    </div>
  );
  const layout = ad.layout ?? "poster";

  let art: React.ReactElement;
  if (layout === "split") {
    art = (
      <div style={{ display: "flex", width: "100%", height: "100%", background: palette.accent }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 470,
            padding: 56,
            color: palette.background,
          }}
        >
          <div style={{ ...small, display: "flex" }}>{brand}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {ad.kicker && <div style={{ ...small, display: "flex", marginBottom: 24, opacity: 0.8 }}>{ad.kicker}</div>}
            <div style={{ display: "flex", fontFamily: "display", fontSize: 76, lineHeight: 1.04 }}>{ad.headline}</div>
          </div>
          {cta(palette.background, palette.accent)}
        </div>
        <img src={photo} width={610} height={1080} style={{ objectFit: "cover" }} />
      </div>
    );
  } else if (layout === "band") {
    art = (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: palette.background }}>
        <img src={photo} width={1080} height={740} style={{ objectFit: "cover" }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            padding: "40px 56px 48px",
            color: palette.foreground,
          }}
        >
          <div style={{ display: "flex", fontFamily: "display", fontSize: 70, lineHeight: 1.05 }}>{ad.headline}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ ...small, display: "flex", color: palette.accent }}>{brand}</div>
            <div style={{ ...small, display: "flex" }}>{ad.kicker ?? ad.cta ?? "Made to order"}</div>
          </div>
        </div>
      </div>
    );
  } else {
    art = (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          height: "100%",
          padding: 56,
          background: palette.background,
          color: palette.foreground,
        }}
      >
        <div style={{ ...small, display: "flex", color: palette.accent }}>{brand}</div>
        <div style={{ display: "flex", marginTop: 36, padding: 14, border: `2px solid ${palette.accent}` }}>
          <img src={photo} width={700} height={560} style={{ objectFit: "cover" }} />
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "display",
            fontSize: 72,
            lineHeight: 1.05,
            textAlign: "center",
            marginTop: 40,
            maxWidth: 900,
          }}
        >
          {ad.headline}
        </div>
        <div style={{ ...small, display: "flex", marginTop: "auto" }}>{ad.kicker ?? ad.cta ?? "Made to order"}</div>
      </div>
    );
  }

  return new ImageResponse(art, {
    width: 1080,
    height: 1080,
    fonts: [
      { name: "display", data: display, style: "normal" },
      { name: "label", data: label, style: "normal" },
    ],
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
