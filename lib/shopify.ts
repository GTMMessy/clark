import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { ShopifyInfo } from "./types";

const API_VERSION = "2026-10";

function run(args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    const bin = path.join(process.cwd(), "shopify-cli", "node_modules", "@shopify", "cli", "bin", "run.js");
    const child = spawn(process.execPath, [bin, ...args], { env, cwd: "/tmp" });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => resolve({ code: -1, out, err: err + String(e) }));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

function findFiles(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, found);
    else found.push(full);
  }
  return found;
}

// Shopify only creates preview stores through its CLI. Each call gets its own home
// directory so the access token the CLI saves there can be read back unambiguously.
export async function createPreviewStore(name: string): Promise<ShopifyInfo> {
  const home = fs.mkdtempSync("/tmp/clark-shopify-");
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_DATA_HOME: path.join(home, ".data"),
    XDG_STATE_HOME: path.join(home, ".state"),
    CI: "1",
    NO_COLOR: "1",
    SHOPIFY_CLI_NO_ANALYTICS: "1",
  };
  const res = await run(["store", "create", "preview", "--name", name, "--country", "US", "--no-input", "--json"], env);
  let store: { id: string; subdomain: string; storefrontUrl: string } | undefined;
  try {
    store = JSON.parse(res.out.slice(res.out.indexOf("{\n"))).store;
  } catch {}
  if (!store) throw new Error(`Shopify store creation failed: ${(res.out + res.err).slice(-400)}`);

  const config = findFiles(home).find((f) => f.includes("shopify-cli-store") && f.endsWith("config.json"));
  if (!config) throw new Error("Shopify store was created but its access token was not saved");
  let token: string | undefined;
  for (const entry of Object.values(JSON.parse(fs.readFileSync(config, "utf8")) as Record<string, any>)) {
    for (const session of Object.values((entry?.sessionsByUserId ?? {}) as Record<string, any>)) {
      if (session.store === store.subdomain) token = session.accessToken;
    }
  }
  // The link the owner follows to claim the store on Shopify; only the CLI, still signed in here, can read it.
  let saveUrl: string | undefined;
  if (token) {
    const info = await run(["store", "info", "--store", store.subdomain, "--no-input", "--json"], env);
    try {
      saveUrl = JSON.parse(info.out.slice(info.out.indexOf("{\n"))).saveUrl;
    } catch {}
  }
  fs.rmSync(home, { recursive: true, force: true });
  if (!token) throw new Error("Shopify store was created but its access token was not found");

  // A brand-new store reports no theme for its first few seconds.
  const shop = { domain: store.subdomain, token };
  let theme: { id: string; role: string } | undefined;
  let publication: { id: string; name: string } | undefined;
  for (let attempt = 0; attempt < 20 && !(theme && publication); attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 2000));
    const data = await shopifyGraphql<{
      themes: { nodes: { id: string; role: string }[] };
      publications: { nodes: { id: string; name: string }[] };
    }>(shop, "{ themes(first: 10) { nodes { id role } } publications(first: 10) { nodes { id name } } }");
    theme = data.themes.nodes.find((t) => t.role === "MAIN");
    publication = data.publications.nodes.find((p) => p.name === "Online Store");
  }
  if (!theme || !publication) throw new Error("The new Shopify store has no theme or online store channel");
  return {
    ...shop,
    storeId: store.id,
    previewUrl: store.storefrontUrl,
    saveUrl,
    themeId: theme.id,
    publicationId: publication.id,
  };
}

export async function shopifyGraphql<T>(
  shop: Pick<ShopifyInfo, "domain" | "token">,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://${shop.domain}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": shop.token, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error(`Shopify ${res.status}: ${JSON.stringify(json.errors ?? json).slice(0, 400)}`);
  }
  return json.data as T;
}

type Shop = Pick<ShopifyInfo, "domain" | "token">;

function userErrors(errors: { message: string }[] | undefined, action: string) {
  if (errors?.length) throw new Error(`${action}: ${errors.map((e) => e.message).join("; ")}`);
}

export async function listThemeFiles(shop: ShopifyInfo): Promise<string[]> {
  const names: string[] = [];
  let after: string | null = null;
  for (let page = 0; page < 6; page++) {
    const data: { theme: { files: { nodes: { filename: string }[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } } =
      await shopifyGraphql(
        shop,
        "query($id: ID!, $after: String) { theme(id: $id) { files(first: 250, after: $after) { nodes { filename } pageInfo { hasNextPage endCursor } } } }",
        { id: shop.themeId, after },
      );
    names.push(...data.theme.files.nodes.map((f) => f.filename));
    if (!data.theme.files.pageInfo.hasNextPage) break;
    after = data.theme.files.pageInfo.endCursor;
  }
  // Translations and assets are noise for design work.
  return names.filter((name) => /^(templates|sections|config|blocks|snippets)\//.test(name));
}

export async function readThemeFile(shop: ShopifyInfo, filename: string): Promise<string> {
  const data = await shopifyGraphql<{
    theme: { files: { nodes: { body: { content?: string } }[] } };
  }>(
    shop,
    `query($id: ID!, $names: [String!]) { theme(id: $id) { files(filenames: $names, first: 1) {
      nodes { body { ... on OnlineStoreThemeFileBodyText { content } } } } } }`,
    { id: shop.themeId, names: [filename] },
  );
  const content = data.theme.files.nodes[0]?.body.content;
  if (content === undefined) throw new Error(`Theme file ${filename} does not exist or is not text`);
  return content;
}

export async function writeThemeFile(shop: ShopifyInfo, filename: string, content: string) {
  const data = await shopifyGraphql<{ themeFilesUpsert: { userErrors: { message: string }[] } }>(
    shop,
    `mutation($id: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $id, files: $files) { userErrors { message } } }`,
    { id: shop.themeId, files: [{ filename, body: { type: "TEXT", value: content } }] },
  );
  userErrors(data.themeFilesUpsert.userErrors, `Could not save ${filename}`);
}

// Shopify's JSON theme files start with a generated comment, which must be kept when writing them back.
export function parseThemeJson(content: string): { head: string; json: any } {
  const start = content.indexOf("{", content.startsWith("/*") ? content.indexOf("*/") : 0);
  return { head: content.slice(0, start), json: JSON.parse(content.slice(start)) };
}
export const serializeThemeJson = (head: string, json: unknown) => head + JSON.stringify(json, null, 2);

// Copies an image into the store's files and returns the reference theme settings expect.
export async function uploadImage(shop: Shop, url: string): Promise<string | null> {
  const created = await shopifyGraphql<{
    fileCreate: { files: { id: string }[]; userErrors: { message: string }[] };
  }>(
    shop,
    `mutation($files: [FileCreateInput!]!) { fileCreate(files: $files) { files { id } userErrors { message } } }`,
    { files: [{ originalSource: url, contentType: "IMAGE" }] },
  );
  userErrors(created.fileCreate.userErrors, "Could not upload the image");
  const id = created.fileCreate.files[0]?.id;
  for (let attempt = 0; id && attempt < 15; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const data = await shopifyGraphql<{ node: { fileStatus: string; image: { url: string } | null } | null }>(
      shop,
      "query($id: ID!) { node(id: $id) { ... on MediaImage { fileStatus image { url } } } }",
      { id },
    );
    if (data.node?.fileStatus === "FAILED") return null;
    if (data.node?.fileStatus === "READY" && data.node.image) {
      const name = new URL(data.node.image.url).pathname.split("/").pop();
      return `shopify://shop_images/${name}`;
    }
  }
  return null;
}

export async function createShopifyProduct(
  shop: ShopifyInfo,
  input: { title: string; descriptionHtml: string; price: number; images: string[]; vendor: string },
): Promise<{ id: string; handle: string }> {
  const data = await shopifyGraphql<{
    productSet: { product: { id: string; handle: string } | null; userErrors: { message: string }[] };
  }>(
    shop,
    `mutation($input: ProductSetInput!) { productSet(synchronous: true, input: $input) {
      product { id handle } userErrors { message } } }`,
    {
      input: {
        title: input.title,
        descriptionHtml: input.descriptionHtml,
        vendor: input.vendor,
        status: "ACTIVE",
        productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
        variants: [{ optionValues: [{ optionName: "Title", name: "Default Title" }], price: input.price.toFixed(2) }],
        files: input.images.slice(0, 4).map((originalSource) => ({ originalSource, contentType: "IMAGE" })),
      },
    },
  );
  userErrors(data.productSet.userErrors, "Could not create the product");
  const product = data.productSet.product!;
  const published = await shopifyGraphql<{ publishablePublish: { userErrors: { message: string }[] } }>(
    shop,
    `mutation($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { message } } }`,
    { id: product.id, input: [{ publicationId: shop.publicationId }] },
  );
  userErrors(published.publishablePublish.userErrors, "Could not publish the product");
  return product;
}

export async function updateShopifyPrice(shop: ShopifyInfo, productId: string, price: number) {
  const data = await shopifyGraphql<{ product: { variants: { nodes: { id: string }[] } } }>(
    shop,
    "query($id: ID!) { product(id: $id) { variants(first: 1) { nodes { id } } } }",
    { id: productId },
  );
  const updated = await shopifyGraphql<{ productVariantsBulkUpdate: { userErrors: { message: string }[] } }>(
    shop,
    `mutation($id: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $id, variants: $variants) { userErrors { message } } }`,
    { id: productId, variants: [{ id: data.product.variants.nodes[0].id, price: price.toFixed(2) }] },
  );
  userErrors(updated.productVariantsBulkUpdate.userErrors, "Could not update the price");
}

export async function deleteShopifyProduct(shop: ShopifyInfo, productId: string) {
  await shopifyGraphql(shop, "mutation($id: ID!) { productDelete(input: { id: $id }) { deletedProductId } }", {
    id: productId,
  });
}

export async function listShopifyProducts(shop: ShopifyInfo): Promise<{ id: string; title: string }[]> {
  const data = await shopifyGraphql<{ products: { nodes: { id: string; title: string }[] } }>(
    shop,
    "{ products(first: 100) { nodes { id title } } }",
  );
  return data.products.nodes;
}

// An unclaimed store sends every visitor to a password page; once that is gone it can take orders.
export async function canSell(shop: Pick<ShopifyInfo, "domain">): Promise<boolean> {
  try {
    const res = await fetch(`https://${shop.domain}/`, { redirect: "manual", cache: "no-store" });
    return !(res.headers.get("location") ?? "").includes("/password") && res.status < 400;
  } catch {
    return false;
  }
}

// The preview link Shopify hands out at creation expires within the hour, so a fresh one is
// fetched whenever someone opens the store. This is the lookup Shopify's own CLI uses for `store info`.
export async function freshLinks(shop: ShopifyInfo): Promise<{ accessUrl?: string; claimUrl?: string }> {
  try {
    const res = await fetch(`https://app.shopify.com/services/preview-stores/${shop.storeId}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Shopify CLI; v=4.9.3",
        "X-Shopify-CLI-Version": "4.9.3",
        "X-Shopify-CLI-Instance": crypto.randomUUID(),
        authorization: shop.token,
        "X-Shopify-Access-Token": shop.token,
      },
      cache: "no-store",
    });
    if (!res.ok) return {};
    const json = await res.json();
    return { accessUrl: json.access_url, claimUrl: json.claim_url };
  } catch {
    return {};
  }
}
