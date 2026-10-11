import { createCheckout } from "./arcade";
import { db, newId } from "./db";
import {
  createShopifyProduct,
  deleteShopifyProduct,
  parseThemeJson,
  readThemeFile,
  serializeThemeJson,
  uploadImage,
  writeThemeFile,
} from "./shopify";
import type { Order, Palette, Product, ShopifyInfo } from "./types";

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Blends two hex colours; used to derive a quiet border tint from the palette.
function mix(a: string, b: string, weight: number) {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [parse(a), parse(b)];
  return "#" + x.map((v, i) => Math.round(v * (1 - weight) + y[i] * weight).toString(16).padStart(2, "0")).join("");
}

// Every theme file is saved once, before its first edit, so any change can be undone.
export async function saveThemeFile(storeId: string, shop: ShopifyInfo, filename: string, content: string) {
  if ((await db.getBackup(storeId, filename)) === null) {
    await db.setBackup(storeId, filename, await readThemeFile(shop, filename));
  }
  await writeThemeFile(shop, filename, content);
}

export type Look = {
  palette: Palette;
  headingFont?: string;
  bodyFont?: string;
  headingCase?: "none" | "uppercase";
  buttonShape?: "square" | "soft" | "pill";
};

// Fonts Shopify's theme accepts, checked against a live store.
export const HEADING_FONTS = [
  "playfair_display_n7",
  "cormorant_n6",
  "fraunces_n6",
  "dm_serif_display_n4",
  "libre_baskerville_n7",
  "bodoni_moda_n6",
  "abril_fatface_n4",
  "josefin_sans_n6",
  "montserrat_n7",
  "space_grotesk_n7",
  "syne_n7",
  "anton_n4",
  "archivo_n7",
  "inter_n7",
];
export const BODY_FONTS = ["lora_n4", "work_sans_n4", "dm_sans_n4", "poppins_n4", "inter_n4"];

// Colours, type and button shape live together in the theme's global settings file.
export async function applyLook(storeId: string, shop: ShopifyInfo, look: Look) {
  const file = "config/settings_data.json";
  const { head, json } = parseThemeJson(await readThemeFile(shop, file));
  const current = json.current;
  current.color_palette = {
    background: look.palette.background,
    foreground: look.palette.foreground,
    color1: look.palette.accent,
    color2: mix(look.palette.background, look.palette.foreground, 0.18),
  };
  if (look.headingFont && HEADING_FONTS.includes(look.headingFont)) {
    current.type_heading_font = look.headingFont;
    current.type_accent_font = look.headingFont;
  }
  if (look.bodyFont && BODY_FONTS.includes(look.bodyFont)) {
    current.type_body_font = look.bodyFont;
    current.type_subheading_font = look.bodyFont;
  }
  if (look.headingCase) {
    for (const key of ["type_case_h1", "type_case_h2", "type_case_h3"]) current[key] = look.headingCase;
  }
  if (look.buttonShape) {
    const radius = { square: 0, soft: 8, pill: 100 }[look.buttonShape];
    current.button_border_radius_primary = radius;
    current.button_border_radius_secondary = radius;
  }
  await saveThemeFile(storeId, shop, file, serializeThemeJson(head, json));
}

export const applyPalette = (storeId: string, shop: ShopifyInfo, palette: Palette) =>
  applyLook(storeId, shop, { palette });

const textBlock = (html: string, settings: Record<string, unknown>) => ({
  type: "text",
  settings: { text: html, width: "fit-content", max_width: "normal", alignment: "center", wrap: "pretty", ...settings },
});

export async function applyHomepage(
  storeId: string,
  shop: ShopifyInfo,
  input: {
    headline?: string;
    buttonLabel?: string;
    announcement?: string;
    bannerImageUrl?: string;
    marquee?: string;
    storyHeading?: string;
    storyText?: string;
    palette?: Palette;
  },
) {
  const notes: string[] = [];
  const file = "templates/index.json";
  const { head, json } = parseThemeJson(await readThemeFile(shop, file));
  const heroKey = Object.keys(json.sections).find((key) => json.sections[key].type === "hero");
  const hero: any = heroKey ? json.sections[heroKey] : null;
  if (hero) {
    hero.settings.section_height = "large";
    for (const block of Object.values(hero.blocks ?? {}) as any[]) {
      if (block.type === "text" && input.headline) {
        block.settings.text = `<p>${escapeHtml(input.headline)}</p>`;
        block.settings.type_preset = "h1";
      }
      if (block.type === "button" && input.buttonLabel) block.settings.label = input.buttonLabel;
    }
    if (input.bannerImageUrl) {
      const image = await uploadImage(shop, input.bannerImageUrl);
      if (image) hero.settings.image_1 = image;
      else notes.push("the banner image could not be uploaded");
    }
  } else notes.push("the homepage has no banner section");
  const plain = serializeThemeJson(head, json);

  // A scrolling brand line under the banner and a short story under the products.
  const order: string[] = json.order.filter((key: string) => !key.startsWith("clark_"));
  for (const key of Object.keys(json.sections)) if (key.startsWith("clark_")) delete json.sections[key];
  const accent = input.palette?.accent;
  if (input.marquee) {
    json.sections.clark_marquee = {
      type: "marquee",
      blocks: {
        text: {
          type: "text",
          settings: {
            text: `<p>${escapeHtml(input.marquee)}</p>`,
            type_preset: "custom",
            font: "var(--font-heading--family)",
            font_size: "var(--font-size--h2)",
            line_height: "tight",
            letter_spacing: "tight",
            case: "none",
            wrap: "nowrap",
            width: "fit-content",
          },
        },
      },
      block_order: ["text"],
      settings: {
        movement_direction: "normal",
        ...(input.palette ? { background_color: mix(input.palette.background, accent!, 0.14) } : {}),
        "padding-block-start": 20,
        "padding-block-end": 20,
        gap_between_elements: 48,
      },
    };
    order.splice(heroKey ? order.indexOf(heroKey) + 1 : 0, 0, "clark_marquee");
  }
  if (input.storyHeading && input.storyText) {
    json.sections.clark_story = {
      type: "section",
      blocks: {
        heading: textBlock(`<p>${escapeHtml(input.storyHeading)}</p>`, { type_preset: "h2" }),
        text: textBlock(`<p>${escapeHtml(input.storyText)}</p>`, { type_preset: "rte", max_width: "narrow" }),
      },
      block_order: ["heading", "text"],
      settings: {
        content_direction: "column",
        horizontal_alignment_flex_direction_column: "center",
        vertical_alignment_flex_direction_column: "center",
        gap: 16,
        section_width: "page-width",
        ...(input.palette ? { background_color: mix(input.palette.background, input.palette.muted, 0.22) } : {}),
        "padding-block-start": 80,
        "padding-block-end": 80,
      },
    };
    order.push("clark_story");
  }
  json.order = order;
  try {
    await saveThemeFile(storeId, shop, file, serializeThemeJson(head, json));
  } catch {
    // Shopify validates sections strictly; keep the banner changes if the extra sections are refused.
    await saveThemeFile(storeId, shop, file, plain);
    if (input.marquee || input.storyHeading) notes.push("the scrolling line and story section were refused by the theme");
  }

  if (input.announcement) {
    const file = "sections/header-group.json";
    const { head, json } = parseThemeJson(await readThemeFile(shop, file));
    for (const section of Object.values(json.sections) as any[]) {
      for (const block of Object.values(section.blocks ?? {}) as any[]) {
        if (block.type === "_announcement") block.settings.text = input.announcement;
      }
    }
    await saveThemeFile(storeId, shop, file, serializeThemeJson(head, json));
  }
  return notes;
}

export async function publishProduct(storeId: string, shop: ShopifyInfo, product: Product, vendor: string) {
  if (product.shopifyProductId || product.status !== "ready" || !product.price) return false;
  if (!(await db.claim(storeId, `publish:${product.id}:${product.jobId ?? ""}`))) return false;
  const details = [product.title, product.description?.split(/\n\s*\n/)[0]].filter(Boolean) as string[];
  const created = await createShopifyProduct(shop, {
    title: product.name,
    descriptionHtml: details.map((text) => `<p>${escapeHtml(text)}</p>`).join("") + "<p>Made to order and shipped in the US.</p>",
    price: product.price,
    images: [...product.images.slice(1), product.images[0]].filter(Boolean),
    vendor,
  });
  if (product.replacesShopifyProductId) {
    await deleteShopifyProduct(shop, product.replacesShopifyProductId).catch(() => {});
    product.replacesShopifyProductId = undefined;
  }
  product.shopifyProductId = created.id;
  product.shopifyHandle = created.handle;
  await db.setProduct(storeId, product);
  return true;
}

// A stand-in for a customer order: the store cannot take payment until it is claimed on Shopify.
// It creates the real Arcade checkout the owner would pay to have the item made and shipped.
export async function createTestOrder(storeId: string, product: Product, quantity = 1): Promise<Order> {
  if (!product.arcadeProductId || !product.cost || !product.price) throw new Error("This product is not ready to order");
  const order: Order = {
    id: newId(),
    ts: Date.now(),
    test: true,
    productId: product.id,
    productName: product.name,
    quantity,
    price: product.price,
    cost: product.cost,
  };
  const checkout = await createCheckout(`clark-order-${storeId}-${order.id}`, product.arcadeProductId, quantity);
  order.arcadeCheckoutId = checkout.checkoutId;
  order.arcadeCheckoutUrl = checkout.checkoutUrl;
  await db.setOrder(storeId, order);
  await db.addActivity(storeId, "Operations", `Test order for ${product.name}: Arcade checkout ready to pay.`);
  return order;
}
