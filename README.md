# Clark

Clark is an AI shopkeeper. Describe the store you want in one sentence; Clark proposes a brand and three
products, has [Arcade](https://docs.arcade.ai) make them, shows what each costs against your price, then opens
a real Shopify store, art-directs it and stocks it. After launch you run the store from one command center by
talking to Clark.

Built in a day for Shopping 3.0, the AI Commerce Hackathon with Arcade.

## What it does

- **Onboarding:** your idea, an optional name and look. Clark replies with a name, palette and three products
  mapped to what Arcade can actually make.
- **Products:** each is designed and built by Arcade in about two minutes and comes back with photos and a
  guaranteed unit cost. You set the price and see the margin. Feedback in plain words remakes a product.
- **Launch:** Clark creates a Shopify store, picks fonts, colours and layout to match the brand, writes the
  copy and publishes the products.
- **Command center:** products with cost, price and margin, orders, ad drafts with finished artwork, an
  activity log, and a chat with Clark.
- **Every morning:** Clark reviews each live store on its own, makes at most one small change and proposes
  the next moves.

## How it works

- Next.js on Vercel.
- One agent, one conversation per store, on Claude through the Anthropic SDK with a streaming tool loop.
  Launch is the same agent following a checklist of tools that refuse to run out of order.
- Arcade API for products: `categories/list`, `patterns/create`, `jobs/get`, `products/get`,
  `checkouts/create`.
- Shopify: the store is created with the Shopify CLI's account-free preview store, then edited through the
  Admin API (products, theme files, images).
- Supabase (one key-value table) for store records.
- Ad artwork is rendered with `next/og`.

## Known limits

- A store cannot take payment until its owner claims it on Shopify and picks a plan.
- Arcade has no API to pay for an order, so fulfilment stops at a pay link the owner clicks.
- Ads are drafted with artwork but not published.
- Shipping was only checked for US addresses.

## Running it

Set these in `.env.local`, then `npm install` and `npm run dev`:

```
ARCADE_API_KEY=
ANTHROPIC_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ACCESS_PASSWORD=        # optional: gate the app behind an access code
CRON_SECRET=            # for the daily review
```

Apply `supabase/migrations` to create the table.
