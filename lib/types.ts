export type Phase = "proposal" | "products" | "launching" | "live";

export type Palette = { background: string; foreground: string; accent: string; muted: string };

export type ProposedProduct = {
  categoryId: string;
  categoryName: string;
  name: string;
  prompt: string;
};

export type Proposal = {
  name: string;
  concept: string;
  tagline: string;
  palette: Palette;
  style: string;
  products: ProposedProduct[];
  note?: string;
};

export type Product = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  prompt: string;
  status: "generating" | "ready" | "failed";
  jobId?: string;
  arcadeProductId?: string;
  title?: string;
  description?: string;
  images: string[];
  cost?: number;
  price?: number;
  error?: string;
  shopifyProductId?: string;
  shopifyHandle?: string;
  replacesShopifyProductId?: string;
  createdAt: number;
  checkedAt?: number;
};

export type ShopifyInfo = {
  domain: string;
  token: string;
  storeId: string;
  previewUrl: string;
  saveUrl?: string;
  themeId: string;
  publicationId: string;
};

export type MetaConnection = { accessToken: string; adAccountId: string; pageId: string };

export type StoreMeta = {
  id: string;
  createdAt: number;
  phase: Phase;
  idea: string;
  nameHint: string;
  inspiration: string;
  proposal?: Proposal;
  shopify?: ShopifyInfo;
  launch: { created?: boolean; themed?: boolean; published?: boolean };
  kickedOff?: boolean;
  headingFont?: string;
  metaCampaignId?: string;
  lastReviewAt?: number;
  metaAds?: MetaConnection;
};

export type Activity = { ts: number; role: string; text: string };

export type Order = {
  id: string;
  ts: number;
  test: boolean;
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  cost: number;
  arcadeCheckoutUrl?: string;
  arcadeCheckoutId?: string;
};

export type Ad = {
  id: string;
  ts: number;
  productId?: string;
  headline: string;
  primaryText: string;
  imageUrl: string;
  audience: string;
  dailyBudget: number;
  layout?: "poster" | "split" | "band";
  kicker?: string;
  cta?: string;
  status: "draft" | "paused" | "failed";
  metaAdId?: string;
  error?: string;
};

export type ChatLine = { role: "user" | "clark"; text: string };
