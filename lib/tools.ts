import type Anthropic from "@anthropic-ai/sdk";
import { listCategories } from "./arcade";
import { db } from "./db";
import { createCampaign, createPausedAd, deleteCampaign } from "./meta";
import { generateProduct } from "./products";
import { createPreviewStore, deleteShopifyProduct, listShopifyProducts, listThemeFiles, parseThemeJson, readThemeFile, updateShopifyPrice, writeThemeFile } from "./shopify";
import {
  applyHomepage,
  applyLook,
  applyPalette,
  BODY_FONTS,
  createTestOrder,
  HEADING_FONTS,
  publishProduct,
  saveThemeFile,
} from "./store-ops";
import type { Ad, Proposal, StoreMeta } from "./types";

export type ToolContext = { storeId: string };

type ToolDef = {
  definition: Anthropic.Tool;
  label: (input: any) => string;
  run: (ctx: ToolContext, input: any) => Promise<string>;
};

const hex = { type: "string", description: "Hex colour such as #1F3A5F" } as const;

export const tools: Record<string, ToolDef> = {
  propose_store: {
    label: () => "Drafting the store proposal",
    definition: {
      name: "propose_store",
      description:
        "Save the store proposal the owner sees on the setup screen: name, tagline, concept, look, palette and exactly three opening products. Call it again with a full replacement whenever the owner asks for changes. Each product needs a category_id from the Arcade catalogue in your instructions.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Store name, 1 to 3 words" },
          tagline: { type: "string", description: "Homepage headline, under 8 words" },
          concept: { type: "string", description: "One sentence on what the store sells and to whom" },
          style: { type: "string", description: "The visual direction in one short sentence" },
          palette: {
            type: "object",
            properties: { background: hex, foreground: hex, accent: hex, muted: hex },
            required: ["background", "foreground", "accent", "muted"],
          },
          products: {
            type: "array",
            description: "Exactly three products",
            items: {
              type: "object",
              properties: {
                category_id: { type: "string" },
                name: { type: "string", description: "Product name as shown in the store" },
                design_prompt: {
                  type: "string",
                  description: "The design brief sent to Arcade, under 400 characters",
                },
              },
              required: ["category_id", "name", "design_prompt"],
            },
          },
          note: {
            type: "string",
            description: "Only when the owner's idea does not fit the catalogue: one sentence saying so and what you proposed instead",
          },
        },
        required: ["name", "tagline", "concept", "style", "palette", "products"],
      },
    },
    async run(ctx, input) {
      const categories = await listCategories();
      const products = [];
      for (const p of input.products ?? []) {
        const category = categories.find((c) => c.categoryId === p.category_id);
        if (!category) return `Error: category_id ${p.category_id} is not in the Arcade catalogue. Use an id from your instructions.`;
        products.push({
          categoryId: category.categoryId,
          categoryName: category.name,
          name: String(p.name),
          prompt: String(p.design_prompt),
        });
      }
      if (products.length !== 3) return "Error: propose exactly three products.";
      const proposal: Proposal = {
        name: String(input.name),
        tagline: String(input.tagline),
        concept: String(input.concept),
        style: String(input.style),
        palette: input.palette,
        products,
        note: input.note ? String(input.note) : undefined,
      };
      await db.patchMeta(ctx.storeId, (meta) => {
        meta.proposal = proposal;
      });
      return "Saved. The owner now sees this proposal and can edit the name, product names and design briefs before making the products.";
    },
  },

  create_shopify_store: {
    label: () => "Opening the Shopify store",
    definition: {
      name: "create_shopify_store",
      description:
        "Launch step 1 of 3. Creates the owner's real Shopify store under the proposal's name. Run once, when the owner asks to launch.",
      input_schema: { type: "object", properties: {} },
    },
    async run(ctx) {
      const meta = await requireMeta(ctx.storeId);
      if (meta.shopify) return "The Shopify store already exists. Next step: apply_brand_theme.";
      if (!meta.proposal) return "Error: there is no proposal yet, so there is nothing to launch.";
      await db.patchMeta(ctx.storeId, (m) => {
        m.phase = "launching";
      });
      await db.addActivity(ctx.storeId, "Web builder", "Opening a new Shopify store.");
      const shopify = await createPreviewStore(meta.proposal.name);
      await db.patchMeta(ctx.storeId, (m) => {
        m.shopify = shopify;
        m.launch.created = true;
      });
      await db.addActivity(ctx.storeId, "Web builder", `Store created at ${shopify.domain}.`);
      return `Created ${shopify.domain}. Next step: apply_brand_theme.`;
    },
  },

  apply_brand_theme: {
    label: () => "Art-directing the storefront",
    definition: {
      name: "apply_brand_theme",
      description:
        "Launch step 2 of 3, and reusable afterwards to restyle. Art-directs the Shopify storefront so it looks like this brand and no other: the palette, the fonts, heading case and button shape, a tall banner with a product's lifestyle photo, the headline, button and announcement bar, a scrolling brand line under the banner and a short brand story under the products. The stock theme is plain black-on-white Inter; choose every option deliberately to match the products and the owner's taste.",
      input_schema: {
        type: "object",
        properties: {
          headline: { type: "string", description: "Homepage banner headline, under 8 words" },
          button_label: { type: "string", description: "Banner button text, 2 to 3 words" },
          announcement: { type: "string", description: "One short line for the bar above the header" },
          heading_font: {
            type: "string",
            enum: HEADING_FONTS,
            description:
              "Display font. Serifs: playfair_display (classic editorial), cormorant (delicate, luxurious), fraunces (soft, retro), dm_serif_display (bold magazine), libre_baskerville (bookish), bodoni_moda (fashion), abril_fatface (heavy poster). Sans: josefin_sans (geometric, vintage), montserrat (clean modern), space_grotesk (techy), syne (arty), anton (condensed, loud), archivo (grotesque), inter (neutral).",
          },
          body_font: {
            type: "string",
            enum: BODY_FONTS,
            description: "Text font: lora (serif, warm), work_sans, dm_sans, poppins (round), inter (neutral)",
          },
          heading_case: { type: "string", enum: ["none", "uppercase"] },
          button_shape: { type: "string", enum: ["square", "soft", "pill"] },
          marquee: {
            type: "string",
            description: "A short phrase that scrolls in a band under the banner, in the brand's voice, under 8 words",
          },
          story_heading: { type: "string", description: "Heading of the brand story section, under 6 words" },
          story_text: { type: "string", description: "Two or three sentences of brand story, concrete and unfussy" },
        },
        required: [
          "headline",
          "button_label",
          "announcement",
          "heading_font",
          "body_font",
          "heading_case",
          "button_shape",
          "marquee",
          "story_heading",
          "story_text",
        ],
      },
    },
    async run(ctx, input) {
      const meta = await requireMeta(ctx.storeId);
      if (!meta.shopify) return "Error: run create_shopify_store first.";
      const palette = meta.proposal!.palette;
      const products = await db.getProducts(ctx.storeId);
      const banner = products.find((p) => p.status === "ready" && p.images.length > 1);
      await db.addActivity(ctx.storeId, "Designer", "Choosing the fonts, colours and layout for the storefront.");
      await applyLook(ctx.storeId, meta.shopify, {
        palette,
        headingFont: input.heading_font,
        bodyFont: input.body_font,
        headingCase: input.heading_case,
        buttonShape: input.button_shape,
      });
      const notes = await applyHomepage(ctx.storeId, meta.shopify, {
        headline: input.headline,
        buttonLabel: input.button_label,
        announcement: input.announcement,
        bannerImageUrl: banner?.images[1],
        marquee: input.marquee,
        storyHeading: input.story_heading,
        storyText: input.story_text,
        palette,
      });
      await db.patchMeta(ctx.storeId, (m) => {
        m.launch.themed = true;
        m.headingFont = input.heading_font;
      });
      const font = String(input.heading_font).replace(/_[a-z]\d$/, "").replace(/_/g, " ");
      await db.addActivity(ctx.storeId, "Designer", `Storefront styled in ${font}: "${input.headline}".`);
      return `Theme applied${notes.length ? `, but ${notes.join(" and ")}` : ""}. ${meta.launch.published ? "The storefront is updated." : "Next step: publish_products."}`;
    },
  },

  publish_products: {
    label: () => "Stocking the shelves",
    definition: {
      name: "publish_products",
      description:
        "Launch step 3 of 3, and reusable afterwards. Publishes every finished product that is not yet in the Shopify store, at the owner's price, and marks the store live.",
      input_schema: { type: "object", properties: {} },
    },
    async run(ctx) {
      const meta = await requireMeta(ctx.storeId);
      if (!meta.shopify) return "Error: run create_shopify_store first.";
      if (!meta.launch.themed) return "Error: run apply_brand_theme first.";
      const published: string[] = [];
      for (const product of await db.getProducts(ctx.storeId)) {
        if (await publishProduct(ctx.storeId, meta.shopify, product, meta.proposal!.name)) {
          published.push(`${product.name} at $${product.price}`);
          await db.addActivity(ctx.storeId, "Merchandiser", `Published ${product.name} at $${product.price}.`);
        }
      }
      await db.patchMeta(ctx.storeId, (m) => {
        m.launch.published = true;
        m.phase = "live";
      });
      if (!meta.launch.published) await db.addActivity(ctx.storeId, "Clark", "The store is live.");
      return published.length ? `Published: ${published.join(", ")}. The store is live.` : "Nothing new to publish. The store is live.";
    },
  },

  generate_product: {
    label: (input) => `Designing ${input?.name ?? "a new product"}`,
    definition: {
      name: "generate_product",
      description:
        "Send a new product to Arcade's makers. Returns immediately; the product appears in the store state about two minutes later with its cost, is priced at twice its cost and is published to the Shopify store automatically. Do not wait for it.",
      input_schema: {
        type: "object",
        properties: {
          category_id: { type: "string", description: "An id from the Arcade catalogue in your instructions" },
          name: { type: "string" },
          design_prompt: { type: "string", description: "The design brief, under 400 characters" },
        },
        required: ["category_id", "name", "design_prompt"],
      },
    },
    async run(ctx, input) {
      const meta = await requireMeta(ctx.storeId);
      const category = (await listCategories()).find((c) => c.categoryId === input.category_id);
      if (!category) return `Error: category_id ${input.category_id} is not in the Arcade catalogue.`;
      const product = await generateProduct(
        ctx.storeId,
        { name: String(input.name), categoryId: category.categoryId, categoryName: category.name, prompt: String(input.design_prompt) },
      );
      if (product.status === "failed") return `Error: Arcade refused the brief: ${product.error}`;
      await db.addActivity(ctx.storeId, "Designer", `Sent ${product.name} (${category.name}) to Arcade's makers.`);
      return `${product.name} is being made (product id ${product.id}). It will be ready in about two minutes.`;
    },
  },

  redesign_product: {
    label: () => "Redesigning the product",
    definition: {
      name: "redesign_product",
      description:
        "Remake an existing product from a revised design brief, when the owner gives feedback on how it looks. Write the full new brief yourself, folding their feedback into the previous one. Returns immediately; the new version replaces the old one in about two minutes. If the product is already in the Shopify store, its listing is replaced when the new version is ready.",
      input_schema: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          design_prompt: { type: "string", description: "The complete revised design brief, under 400 characters" },
          name: { type: "string", description: "A new product name, only if the owner asked for one" },
        },
        required: ["product_id", "design_prompt"],
      },
    },
    async run(ctx, input) {
      const meta = await requireMeta(ctx.storeId);
      const product = (await db.getProducts(ctx.storeId)).find((p) => p.id === input.product_id);
      if (!product) return "Error: no product with that id. Use an id from the store state.";
      const next = await generateProduct(
        ctx.storeId,
        { ...product, name: input.name ? String(input.name) : product.name, prompt: String(input.design_prompt) },
      );
      if (next.status === "failed") return `Error: Arcade refused the brief: ${next.error}`;
      await db.addActivity(ctx.storeId, "Designer", `Redesigning ${next.name}.`);
      return `${next.name} is being remade. It will be ready in about two minutes.`;
    },
  },

  remove_product: {
    label: () => "Removing the product",
    definition: {
      name: "remove_product",
      description: "Take a product out of the store for good: deletes its Shopify listing and Clark's record of it.",
      input_schema: { type: "object", properties: { product_id: { type: "string" } }, required: ["product_id"] },
    },
    async run(ctx, input) {
      const meta = await requireMeta(ctx.storeId);
      const product = (await db.getProducts(ctx.storeId)).find((p) => p.id === input.product_id);
      if (!product) return "Error: no product with that id. Use an id from the store state.";
      if (meta.shopify && product.shopifyProductId) await deleteShopifyProduct(meta.shopify, product.shopifyProductId);
      await db.deleteProduct(ctx.storeId, product.id);
      await db.addActivity(ctx.storeId, "Merchandiser", `Removed ${product.name} from the store.`);
      return `Removed ${product.name}.`;
    },
  },

  tidy_shopify_listings: {
    label: () => "Tidying the shelves",
    definition: {
      name: "tidy_shopify_listings",
      description:
        "Delete every Shopify listing that does not match a product in Clark's records, such as duplicates or leftovers from a redesign. Use it when the owner sees extra or repeated products on the storefront.",
      input_schema: { type: "object", properties: {} },
    },
    async run(ctx) {
      const meta = await requireMeta(ctx.storeId);
      if (!meta.shopify) return "Error: the Shopify store does not exist yet.";
      const kept = new Set((await db.getProducts(ctx.storeId)).map((p) => p.shopifyProductId));
      const removed: string[] = [];
      for (const listing of await listShopifyProducts(meta.shopify)) {
        if (kept.has(listing.id)) continue;
        await deleteShopifyProduct(meta.shopify, listing.id);
        removed.push(listing.title);
      }
      if (removed.length) await db.addActivity(ctx.storeId, "Merchandiser", `Removed ${removed.length} stray listings from the storefront.`);
      return removed.length ? `Deleted: ${removed.join(", ")}.` : "The storefront already matches Clark's records.";
    },
  },

  set_price: {
    label: () => "Updating the price",
    definition: {
      name: "set_price",
      description: "Set a product's retail price in dollars, in Clark's records and in the Shopify store.",
      input_schema: {
        type: "object",
        properties: { product_id: { type: "string" }, price: { type: "number" } },
        required: ["product_id", "price"],
      },
    },
    async run(ctx, input) {
      const meta = await requireMeta(ctx.storeId);
      const product = (await db.getProducts(ctx.storeId)).find((p) => p.id === input.product_id);
      if (!product) return "Error: no product with that id. Use an id from the store state.";
      product.price = Math.round(Number(input.price) * 100) / 100;
      await db.setProduct(ctx.storeId, product);
      if (meta.shopify && product.shopifyProductId) await updateShopifyPrice(meta.shopify, product.shopifyProductId, product.price);
      await db.addActivity(ctx.storeId, "Merchandiser", `${product.name} now sells for $${product.price}.`);
      return `Price set to $${product.price}${product.cost ? `; margin is $${(product.price - product.cost).toFixed(2)} a sale` : ""}.`;
    },
  },

  set_theme_palette: {
    label: () => "Recolouring the storefront",
    definition: {
      name: "set_theme_palette",
      description: "Change the storefront's colours: page background, text, accent and a muted tone.",
      input_schema: {
        type: "object",
        properties: { background: hex, foreground: hex, accent: hex, muted: hex },
        required: ["background", "foreground", "accent", "muted"],
      },
    },
    async run(ctx, input) {
      const meta = await requireMeta(ctx.storeId);
      if (!meta.shopify) return "Error: the Shopify store does not exist yet.";
      await applyPalette(ctx.storeId, meta.shopify, input);
      await db.patchMeta(ctx.storeId, (m) => {
        if (m.proposal) m.proposal.palette = input;
      });
      await db.addActivity(ctx.storeId, "Designer", `Recoloured the storefront (${input.background} on ${input.foreground}).`);
      return "Palette applied to the live storefront.";
    },
  },

  list_theme_files: {
    label: () => "Looking through the theme",
    definition: {
      name: "list_theme_files",
      description:
        "List the Shopify theme's files. Useful ones: templates/index.json (homepage sections), templates/product.json (product page), config/settings_data.json (colours, fonts, global settings), sections/header-group.json and sections/footer-group.json.",
      input_schema: { type: "object", properties: {} },
    },
    async run(ctx) {
      const meta = await requireMeta(ctx.storeId);
      if (!meta.shopify) return "Error: the Shopify store does not exist yet.";
      return (await listThemeFiles(meta.shopify)).join("\n");
    },
  },

  read_theme_file: {
    label: (input) => `Reading ${input?.filename ?? "a theme file"}`,
    definition: {
      name: "read_theme_file",
      description: "Read one Shopify theme file. Read a file before editing it.",
      input_schema: { type: "object", properties: { filename: { type: "string" } }, required: ["filename"] },
    },
    async run(ctx, input) {
      const meta = await requireMeta(ctx.storeId);
      if (!meta.shopify) return "Error: the Shopify store does not exist yet.";
      const content = await readThemeFile(meta.shopify, String(input.filename));
      return content.length > 30000 ? content.slice(0, 30000) + "\n[truncated: file is longer than 30,000 characters]" : content;
    },
  },

  edit_theme_file: {
    label: (input) => `Editing ${input?.filename ?? "the theme"}`,
    definition: {
      name: "edit_theme_file",
      description:
        "Edit one Shopify theme file by replacing an exact piece of its text. The original file is backed up before its first edit, and a JSON file that would become invalid is rejected. Use this for any storefront change the other tools do not cover: fonts, layout settings, section text, adding or reordering sections.",
      input_schema: {
        type: "object",
        properties: {
          filename: { type: "string" },
          find: { type: "string", description: "Exact text currently in the file; must appear once" },
          replace: { type: "string", description: "Text to put in its place" },
          summary: { type: "string", description: "What this change does, for the activity log" },
        },
        required: ["filename", "find", "replace", "summary"],
      },
    },
    async run(ctx, input) {
      const meta = await requireMeta(ctx.storeId);
      if (!meta.shopify) return "Error: the Shopify store does not exist yet.";
      const filename = String(input.filename);
      const content = await readThemeFile(meta.shopify, filename);
      const count = content.split(String(input.find)).length - 1;
      if (count !== 1) return `Error: the text to find appears ${count} times in ${filename}; it must appear exactly once. Read the file and use a longer, exact excerpt.`;
      const next = content.replace(String(input.find), () => String(input.replace));
      if (filename.endsWith(".json")) {
        try {
          parseThemeJson(next);
        } catch {
          return "Error: that edit would make the file invalid JSON, so it was not saved.";
        }
      }
      await saveThemeFile(ctx.storeId, meta.shopify, filename, next);
      await db.addActivity(ctx.storeId, "Web builder", String(input.summary));
      return `Saved ${filename}.`;
    },
  },

  restore_theme_file: {
    label: (input) => `Restoring ${input?.filename ?? "the theme"}`,
    definition: {
      name: "restore_theme_file",
      description: "Undo all edits to one theme file by restoring the copy saved before its first edit.",
      input_schema: { type: "object", properties: { filename: { type: "string" } }, required: ["filename"] },
    },
    async run(ctx, input) {
      const meta = await requireMeta(ctx.storeId);
      if (!meta.shopify) return "Error: the Shopify store does not exist yet.";
      const backup = await db.getBackup(ctx.storeId, String(input.filename));
      if (backup === null) return "Error: that file has not been edited, so there is nothing to restore.";
      await writeThemeFile(meta.shopify, String(input.filename), backup);
      await db.addActivity(ctx.storeId, "Web builder", `Restored ${input.filename} to its original.`);
      return `Restored ${input.filename}.`;
    },
  },

  create_test_order: {
    label: () => "Placing a test order",
    definition: {
      name: "create_test_order",
      description:
        "Simulate one customer order for a product. The Shopify store cannot take real payments until the owner claims it, so this stands in for a sale: it creates the real Arcade checkout the owner pays to have the item made and shipped.",
      input_schema: {
        type: "object",
        properties: { product_id: { type: "string" }, quantity: { type: "integer" } },
        required: ["product_id"],
      },
    },
    async run(ctx, input) {
      const product = (await db.getProducts(ctx.storeId)).find((p) => p.id === input.product_id);
      if (!product) return "Error: no product with that id. Use an id from the store state.";
      const order = await createTestOrder(ctx.storeId, product, Number(input.quantity) || 1);
      return `Test order recorded. Arcade checkout to pay: ${order.arcadeCheckoutUrl}. Clark cannot pay it; the owner does, from the orders list.`;
    },
  },

  draft_ads: {
    label: () => "Writing the ads",
    definition: {
      name: "draft_ads",
      description:
        "Save Meta (Facebook and Instagram) ad drafts for the owner to review in the command center's Meta ads section. One ad per product. Clark renders each as finished square artwork: the product's lifestyle photo set in the store's colours and display font, with the headline, a kicker and a call to action on the image. Give each ad a different angle (the occasion, the gift, the craft, the look) and a different layout, and write like the brand, not like an ad. Drafting again for a product replaces its earlier draft.",
      input_schema: {
        type: "object",
        properties: {
          ads: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string" },
                headline: { type: "string", description: "The line set large on the artwork, under 40 characters" },
                layout: {
                  type: "string",
                  enum: ["poster", "split", "band"],
                  description:
                    "poster: framed photo with the headline centred below, quiet and editorial. split: a block of the accent colour with the headline beside a tall photo, bold. band: full-width photo over a band of text, photographic.",
                },
                kicker: { type: "string", description: "A few words set small in capitals, such as Made to order" },
                cta: { type: "string", description: "Button text, 2 to 3 words" },
                primary_text: { type: "string", description: "The text above the image, under 125 characters" },
                audience: { type: "string", description: "Who it targets, in one plain line. Ads run in the US." },
                daily_budget: { type: "number", description: "Dollars a day" },
              },
              required: ["product_id", "headline", "layout", "kicker", "cta", "primary_text", "audience", "daily_budget"],
            },
          },
        },
        required: ["ads"],
      },
    },
    async run(ctx, input) {
      const products = await db.getProducts(ctx.storeId);
      const saved: string[] = [];
      for (const draft of input.ads ?? []) {
        const product = products.find((p) => p.id === draft.product_id);
        if (!product || !product.images.length) return `Error: product ${draft.product_id} is not ready. Use a finished product's id from the store state.`;
        const ad: Ad = {
          id: `ad-${product.id}`,
          ts: Date.now(),
          productId: product.id,
          headline: String(draft.headline),
          primaryText: String(draft.primary_text),
          imageUrl: product.images[1] ?? product.images[0],
          audience: String(draft.audience),
          dailyBudget: Number(draft.daily_budget) || 10,
          layout: ["poster", "split", "band"].includes(draft.layout) ? draft.layout : "poster",
          kicker: draft.kicker ? String(draft.kicker) : undefined,
          cta: draft.cta ? String(draft.cta) : undefined,
          status: "draft",
        };
        await db.setAd(ctx.storeId, ad);
        saved.push(ad.headline);
      }
      await db.addActivity(ctx.storeId, "Marketer", `Drafted ${saved.length} Meta ads.`);
      return `Saved ${saved.length} drafts. They are shown in the Meta ads section. They are not running. The owner sets a daily budget there and then publishes; launch_ads does the publishing.`;
    },
  },

  launch_ads: {
    label: () => "Creating the ads in Meta",
    definition: {
      name: "launch_ads",
      description:
        "Publish every drafted ad to Meta from Clark's ad account, as a traffic campaign that starts paused so nothing spends until it is switched on. Use the budgets in the store state.",
      input_schema: { type: "object", properties: {} },
    },
    async run(ctx) {
      const meta = await requireMeta(ctx.storeId);
      // Publishing waits on the owner being able to fund the ad account; until then ads stop at "ready".
      if (process.env.META_PUBLISH_ENABLED !== "1") {
        return "The ads are ready to publish, but publishing is not open yet: the owner first needs to add funds, which is coming soon. Nothing was sent to Meta.";
      }
      const connection = metaConnection(meta);
      if (!connection) return "Error: Clark's Meta ad account is not connected yet, so the ads stay as drafts. This is on Clark's side, not something the owner can fix.";
      const drafts = (await db.getAds(ctx.storeId)).filter((ad) => ad.status !== "paused");
      if (!drafts.length) return "Error: there are no drafted ads to launch. Use draft_ads first.";
      const app = process.env.APP_URL ?? "https://clark-silk.vercel.app";
      const link = `${app}/s/${ctx.storeId}`;
      let campaignId: string;
      try {
        // A second attempt replaces the first, so Ads Manager never shows two copies.
        if (meta.metaCampaignId) await deleteCampaign(connection, meta.metaCampaignId);
        campaignId = await createCampaign(connection, `${meta.proposal?.name ?? "Clark"} launch`);
        await db.patchMeta(ctx.storeId, (m) => {
          m.metaCampaignId = campaignId;
        });
      } catch (e) {
        return `Error: Meta refused the campaign: ${e instanceof Error ? e.message : String(e)}`;
      }
      const outcomes: string[] = [];
      for (const ad of drafts) {
        try {
          // Meta gets the finished artwork, not the bare product photo.
          const artwork = {
            ...ad,
            imageUrl: `${app}/api/stores/${ctx.storeId}/creatives/${ad.id.replace(/^ad-/, "")}/image`,
          };
          ad.metaAdId = await createPausedAd(connection, campaignId, artwork, link);
          ad.status = "paused";
          ad.error = undefined;
          outcomes.push(`${ad.headline}: created, paused`);
        } catch (e) {
          ad.status = "failed";
          ad.error = e instanceof Error ? e.message : String(e);
          outcomes.push(`${ad.headline}: failed (${ad.error})`);
        }
        await db.setAd(ctx.storeId, ad);
      }
      await db.addActivity(ctx.storeId, "Marketer", `Sent ${drafts.length} ads to Meta as a paused campaign.`);
      return outcomes.join("\n");
    },
  },
};

// Ads run from Clark's own Meta ad account, as the advertiser of record.
export function metaConnection(meta: StoreMeta) {
  const { META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_PAGE_ID } = process.env;
  if (META_ACCESS_TOKEN && META_AD_ACCOUNT_ID && META_PAGE_ID) {
    return { accessToken: META_ACCESS_TOKEN, adAccountId: META_AD_ACCOUNT_ID, pageId: META_PAGE_ID };
  }
  return meta.metaAds ?? null;
}

async function requireMeta(storeId: string): Promise<StoreMeta> {
  const meta = await db.getMeta(storeId);
  if (!meta) throw new Error("Store not found");
  return meta;
}
