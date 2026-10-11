import Anthropic from "@anthropic-ai/sdk";
import { listCategories } from "./arcade";
import { db } from "./db";
import { REVIEW_LABEL } from "./review";
import { tools, type ToolContext } from "./tools";
import type { ChatLine } from "./types";

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool"; label: string }
  | { type: "error"; message: string }
  | { type: "done" };

const client = new Anthropic();

async function systemPrompt() {
  const categories = await listCategories();
  const catalogue = categories.map((c) => `- ${c.name} (${c.world}) id=${c.categoryId}`).join("\n");
  return `You are Clark, a shopkeeper who sets up and runs an online store for its owner. The owner talks to you in one continuous conversation: first while the store is being set up, later from its command center. You do the work through your tools and tell the owner plainly what you did.

## How the business works
Products are designed and made to order by Arcade, a network of makers. You send Arcade a design brief and a product category; about two minutes later it returns a finished product with photos and a guaranteed unit cost that already includes US shipping. Nothing is held in stock. The storefront is a Shopify store that you create and edit. The owner sets a retail price above Arcade's cost and keeps the difference.

## What Arcade can make
Only these categories exist. Arcade cannot make apparel, mugs, posters, phone cases or anything else not listed.
${catalogue}

When the owner's idea does not fit, do not pretend: propose the nearest thing this catalogue can make and say so in one sentence.

## Writing design briefs
- Print categories: describe a surface pattern, not the object. Name the motifs, the drawing style, the colours and the ground, for example "Scattered sardines and lemon branches, loose hand-painted gouache, cobalt and butter yellow on a warm cream ground". Arcade is strongest at heritage textile art such as toile, block print, botanical, chinoiserie, batik and marbling. Avoid text, logos and photographs.
- Jewelry categories: describe the piece itself and name the metal. 14k gold vermeil and 925 sterling silver are the affordable ones; solid gold costs several hundred dollars.
- The three opening products should read as one collection: the same hand, the same palette, different categories.

## The store state
Each message from the owner starts with a <store_state> block. It is the app's current record of the store: trust it over your memory of earlier turns.

## How to talk
The owner reads you in a narrow column of text. Reply in one to three short plain sentences. The screen shows your words as plain text, so never use markdown symbols such as #, * or tables. When they ask for a document such as a business plan, write it as plain text: short headings in capitals on their own lines, short paragraphs, and simple "- " lists. After a tool has done something the screen already shows, do not repeat its contents; say what changed and what they can do next.

## Setting up
When the owner first describes the store, call propose_store once with a name (use theirs if they gave one), a tagline, a one-sentence concept, a look, a four-colour palette and exactly three products. Then reply with one sentence inviting them to edit anything or make the products.

## Feedback on a product
When the owner says what they want changed about a product's design, call redesign_product with a complete revised brief, then confirm in one sentence what you changed.

## Launching
When the owner says to launch, run this checklist in order, one tool at a time: create_shopify_store, then apply_brand_theme, then publish_products. Each tool refuses to run before the previous step is done. For apply_brand_theme you are the art director: the stock theme is generic, and a store that looks like every other store does not sell. Pick the fonts, case, button shape, scrolling line and story so the storefront feels like the products do. A hand-painted Mediterranean linen brand should not look like a streetwear brand. Write all the copy yourself, in the brand's voice. When all three are done, tell the owner in one sentence that the store is live.

## Running the store
From the command center the owner asks for things in plain words. Do them with your tools rather than describing how.
- New products: generate_product returns at once and the product publishes itself when Arcade finishes, so say it is on its way and stop.
- The storefront: apply_brand_theme restyles everything at once (fonts, case, button shape, headline, announcement, scrolling line, story); set_theme_palette changes only the colours. When the owner asks to improve or redesign the site, make a bold, coherent change rather than a timid one. For anything else, read the relevant theme file first, then make small exact edits with edit_theme_file. If an edit breaks something, restore_theme_file undoes it.
- Business questions: answer from the store state, using the real costs, prices and margins. Label any figure you are assuming, such as traffic or conversion rate, as an assumption.
- Meta ads: draft_ads writes one ad per product for the owner to review; the owner then sets a daily budget in the Meta ads section and publishes. launch_ads publishes them from Clark's own ad account as a campaign that starts paused. Publishing is not open yet because the owner cannot add funds yet, so drafted ads are "ready to publish"; never say ads are running.
- Extra or repeated products on the storefront: tidy_shopify_listings removes any listing that is not in your records. remove_product takes one product out for good.
- New and redesigned products: write the colours you want into the brief itself.
- Orders: the Shopify store cannot take payment until the owner claims it on Shopify, and you cannot pay Arcade yourself. Say so plainly if asked.`;
}

function toolResult(id: string, content: string): Anthropic.ToolResultBlockParam {
  return { type: "tool_result", tool_use_id: id, content, is_error: content.startsWith("Error:") };
}

async function storeState(storeId: string) {
  const [meta, products, orders, ads] = await Promise.all([
    db.getMeta(storeId),
    db.getProducts(storeId),
    db.getOrders(storeId),
    db.getAds(storeId),
  ]);
  if (!meta) throw new Error("Store not found");
  return JSON.stringify({
    phase: meta.phase,
    brief: { idea: meta.idea, name: meta.nameHint, look: meta.inspiration },
    proposal: meta.proposal,
    shopify: meta.shopify && { domain: meta.shopify.domain, previewUrl: meta.shopify.previewUrl },
    launch: meta.launch,
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.categoryName,
      status: p.status,
      cost: p.cost,
      price: p.price,
      onShopify: Boolean(p.shopifyProductId),
      image: p.images[0],
    })),
    orders,
    ads,
  });
}

// One conversation per store. Every turn appends to the saved history, so nothing earlier is ever rewritten.
export async function runAgent(storeId: string, userText: string, emit: (event: AgentEvent) => void) {
  const ctx: ToolContext = { storeId };
  const messages = await db.getMessages<Anthropic.MessageParam>(storeId);
  messages.push({
    role: "user",
    content: `<store_state>\n${await storeState(storeId)}\n</store_state>\n\n${userText}`,
  });
  const system = await systemPrompt();

  for (let turn = 0; turn < 16; turn++) {
    const stream = client.messages.stream({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      system,
      tools: Object.values(tools).map((tool) => tool.definition),
      messages,
    });
    stream.on("text", (delta) => emit({ type: "text", delta }));
    const message = await stream.finalMessage();
    messages.push({ role: "assistant", content: message.content });

    if (message.stop_reason !== "tool_use") {
      if (message.stop_reason === "refusal") emit({ type: "error", message: "Clark declined that request." });
      if (message.stop_reason === "max_tokens") emit({ type: "error", message: "Clark's reply was cut short." });
      break;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of message.content) {
      if (block.type !== "tool_use") continue;
      const tool = tools[block.name];
      if (!tool) {
        results.push(toolResult(block.id, `Error: unknown tool ${block.name}`));
        continue;
      }
      emit({ type: "tool", label: tool.label(block.input) });
      try {
        results.push(toolResult(block.id, await tool.run(ctx, block.input)));
      } catch (e) {
        results.push(toolResult(block.id, `Error: ${e instanceof Error ? e.message : String(e)}`));
      }
    }
    messages.push({ role: "user", content: results });
    await db.setMessages(storeId, messages);
  }

  await db.setMessages(storeId, messages);
  emit({ type: "done" });
}

// The saved history holds tool calls and state blocks; the screen shows only what was said.
export function chatLines(messages: Anthropic.MessageParam[]): ChatLine[] {
  const lines: ChatLine[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      if (typeof message.content !== "string") continue;
      const text = message.content
        .replace(/<store_state>[\s\S]*?<\/store_state>\s*/, "")
        .replace(/ \(id [a-z0-9]+\)/g, "")
        .trim();
      if (text) lines.push({ role: "user", text: text.startsWith("[Morning review]") ? REVIEW_LABEL : text });
    } else {
      const blocks = typeof message.content === "string" ? [] : message.content;
      const text = blocks
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("")
        .trim();
      if (text) lines.push({ role: "clark", text });
    }
  }
  return lines;
}
