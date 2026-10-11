# Clark: build plan

Hackathon: Shopping 3.0, the AI Commerce Hackathon with Arcade (SF Tech Week), 2026-10-11.
Submission due around 2:45pm PDT today. Owner: Paul-Emile (solo).
Judges include Kirsten Green (Forerunner), Mariam Naficy (CEO of Arcade, founder of Minted), Ash Herr (TIAT). Prizes $10k / $5k.

Anything marked **untested** has not been proven yet. Correct this doc directly if something is wrong.

## 1. What Clark is

Anyone describes a store. An AI agent creates the products on Arcade, launches a real Shopify store, then runs it from a single command center with a chat. Polsia / Nanocorp style.

Arcade (docs.arcade.ai) is the API underneath: text prompt in, pattern or jewelry design out, turned into a made-on-demand physical product with an instant guaranteed price, drop-shipped.

## 2. Decisions already agreed

| # | Topic | Decision |
|---|-------|----------|
| 1 | Storefront | Real Shopify store created programmatically (Shopify "preview store", no Shopify account needed). Cannot take payment until the owner clicks "Save store", creates an account and picks a plan. Accepted; claiming is something we automate later. |
| 2 | Out of scope | No Stripe. No self-hosted storefront. Skip Arcade's own Shopify app (apps.shopify.com/arcade-studio). |
| 3 | Hosting | Our app (onboarding + command center) on Vercel. No custom domain. |
| 4 | Agent | One agent, one conversation per store, from the first onboarding screen through the command center. Not efficient, but simple. UI shows its work as role-tagged activity lines. |
| 5 | Launch | Same agent following a strict checklist: each step is a tool that refuses to run until the previous step is done. |
| 6 | Site customisation | Owner customises the website through chat. The agent can read and edit Shopify theme files directly, keeping a backup of each file before editing. |
| 7 | Meta Ads | Dedicated section in the command center. Built last but required ("otherwise it doesn't sell"). See section 8 for what the owner must do in parallel. |
| 8 | Fulfilment | Arcade has no API to pay for an order. The agent creates the Arcade checkout; the command center shows the pay link for the owner to click. Bulk ordering is cheaper but out of scope. |
| 9 | Design | Mimic messy-labs.com for onboarding and command center (details in section 6). The Shopify storefront is styled by the agent per brand. |
| 10 | Onboarding rules | Suggested retail price = 2x Arcade cost. Inspiration is text plus palette and style only (no image upload). No login: the store's URL is the key. |

Note on decision 8: Arcade staff confirmed on site that checkout creation exists, that payment cannot be done programmatically, and that a merchant must build their own checkout on top of Arcade's price.

## 3. What is proven and what is not

### Verified today

**Arcade**
- API key works.
- 21 print categories (home textiles, scarves, pocket squares, lampshades, fabric) and 8 jewelry categories. No t-shirts or mugs.
- 26 style models, mostly heritage / archival looks.
- One product generation takes about 2 minutes (measured 114s) and returns 3 images including a lifestyle shot.
- Price exists only after generation.
- Shipping: US standard showed as free (5 business days). A French address was refused; a US one worked. Only those two were tested.
- Arcade's agent guidelines: do not pay or automate payment; one generation at a time unless the human approves more; poll jobs every 2 to 5 seconds; API is rate-limited per IP.

Example pricing, linen tea towels (set of 2):

| Quantity | Arcade cost each |
|----------|------------------|
| 1 | $73.60 |
| 10 | $62.80 |
| 50 | $61.84 |

**Shopify**
- `shopify store create preview` created a real store in about 5 seconds with no account.
- The access token covers products, files, themes, navigation, pages, discounts and read-orders.
- Done through the Admin API: pushed a product with Arcade images at a $128 retail price, published it to the Online Store channel, changed the homepage headline and button text, changed the colour palette to pink.
- The public address shows a password page; visitors use a private preview link.
- The same store creation works from a Vercel function (about 9 seconds). After creation everything is plain HTTPS calls to the store's Admin API.

**Other**
- Anthropic API key works (Claude Opus 5.5 available).
- Vercel CLI is logged in.

### Untested

| Item | Why it matters |
|------|----------------|
| Replacing the homepage banner image (untested) | Part of "apply brand theme" |
| Changing fonts (untested) | Part of chat-driven site customisation |
| Adding theme sections (untested) | Part of chat-driven site customisation |
| Running 3 Arcade generations in parallel (untested; owner approval also pending) | Onboarding needs 3 products; sequential is about 6 minutes |
| Creating Meta ads through the Marketing API (untested; needs the owner's ad account; Live-mode requirement is inferred from Meta docs) | Required feature, built last |
| Shopify checkout on a claimed store (untested) | We never show a real customer payment |

## 4. Architecture

- Next.js app on Vercel.
- Claude (Opus 5.5) via the Anthropic SDK, streaming tool loop.
- A small hosted Redis database, one record set per store.
- Shopify CLI bundled only for store creation.

### Agent tools

| Tool | What it does |
|------|--------------|
| Propose store | Name, concept, palette, style, 3 products mapped to Arcade categories |
| Generate product | Starts an Arcade job and returns immediately; the page polls |
| Publish product | Publishes to Shopify at a price |
| Set price | Changes a product's price |
| Create Shopify store | Creates the preview store |
| Apply brand theme | Palette, headline, banner (banner is untested) |
| Read / edit theme file | Direct theme edits, with a backup of each file first (fonts and sections untested) |
| Read store snapshot | Products, costs, prices, margins, orders; used for business questions |
| Create test order | Creates the Arcade checkout and returns the pay link |
| Draft ads / launch ads | Built last (launch is untested) |

## 5. Screens

### Onboarding: 4 screens, one column

1. **Three inputs**: what you want to sell, a name (optional), design inspiration (optional).
2. **Proposal**: the agent's editable proposal. If the idea does not fit Arcade's catalogue it says so and proposes the nearest thing.
3. **Products**: products generating, then cost against your price with live margin. Regenerate per product.
4. **Launch**: activity log while the store is created, themed and stocked, then the command center.

### Command center: two columns of plain text

- **Left**: store name with links to open the store and to claim it on Shopify; a numbers line; products with cost / price / margin; orders; Meta Ads section; activity log.
- **Right**: chat, with preset prompts as underlined links:
  - add a product
  - improve my website
  - questions about my business (for example a business plan)
  - launch Meta ads

## 6. Design (onboarding and command center)

Mimic messy-labs.com:
- White page, one narrow column (about 680px).
- Uppercase JetBrains Mono, about 15px, slight letter-spacing.
- Near-black text (#1F1D18), one muted olive accent.
- Underlined text links.
- No boxes, no buttons, no decorative images.

## 7. Build steps

Each step ends with something the owner checks.

| # | Step | Owner checks | Status |
|---|------|--------------|--------|
| 1 | Skeleton, messy-labs design, database, secrets, first deploy | The deployed page looks right | In progress |
| 2 | Onboarding | 3 real Arcade products with cost against price | Not started |
| 3 | Launch | Activity screen, then a branded Shopify store with the products | Not started |
| 4 | Command center and chat | Presets add a product, edit the site, answer a business question; test order shows the Arcade pay link | Not started |
| 5 | Meta Ads section | Ads section in the command center | Not started |
| 6 | Demo store pre-generated plus pitch run-through | A full dry run of the demo script | Not started |

### If time runs short, cut in this order

1. Test order.
2. Free-form theme editing (keep palette and headline).
3. Live Meta launch (keep drafts).

## 8. Owner action needed in parallel: Meta ad account

The owner has no Meta ad account yet. To get live ads:
- Facebook login.
- A Page.
- A developer app with Marketing API switched to Live mode (Live-mode requirement is inferred from Meta docs, untested).
- A token with `ads_management`, `pages_show_list`, `pages_read_engagement`.
- Send: token + ad account ID + Page ID.

If this is not ready, the Meta Ads section ships as drafted ads with a preview only.

## 9. Demo script (60 to 90 seconds)

The pitch must not wait on a 2-minute generation, so the demo uses a pre-generated store (build step 6).

1. Type an idea into onboarding.
2. See the agent's proposal.
3. Show the pre-generated products with cost, price and margin.
4. Launch: activity log runs.
5. Open the Shopify store.
6. In the chat, ask to change the store's look, then to add a product.
7. Show the Meta Ads section.

## 10. Known limits to say out loud

- The store cannot take payment until it is claimed on Shopify.
- Paying Arcade for an order is a manual click.
- US shipping only, as far as tested.
- Ads need the owner's Meta account.

## 11. Open questions

- Exact submission time and format?
- Are 3 parallel Arcade generations approved?
- Will the Meta account be ready in time?
- Which store idea do we use for the demo?
