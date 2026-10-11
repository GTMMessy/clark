"use client";

import { useEffect, useRef, useState } from "react";
import { thumb } from "@/lib/thumb";
import { clock } from "./launch";
import type { StoreApi } from "./use-store";

const money = (n: number) => `$${n.toFixed(2)}`;

const presets = [
  { label: "Add a product", text: "Add a new product that fits the collection. Choose the category and design it yourself." },
  {
    label: "Improve my website",
    text: "Improve my storefront's homepage: sharpen the headline, button and announcement, and refine the colours if they need it. Tell me what you changed.",
  },
  {
    label: "Write my business plan",
    text: "Write a one-page business plan for this store using its real costs, prices and margins.",
  },
  {
    label: "Generate ads",
    text: "Draft Meta ads for this store: one ad for each product, with the audience and a daily budget.",
  },
];

export function CommandCenter({ id, store }: { id: string; store: StoreApi }) {
  const { meta, products, orders, ads, activity, chat } = store.state!;
  const [text, setText] = useState("");
  const [ordering, setOrdering] = useState("");
  const lines = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lines.current) lines.current.scrollTop = lines.current.scrollHeight;
  }, [chat.length, store.reply, store.working, store.pending]);

  const listed = products.filter((p) => p.status === "ready" && p.cost && p.price);
  const margin = listed.length
    ? Math.round((listed.reduce((sum, p) => sum + (p.price! - p.cost!) / p.price!, 0) / listed.length) * 100)
    : 0;
  const revenue = orders.reduce((sum, o) => sum + o.price * o.quantity, 0);
  const profit = orders.reduce((sum, o) => sum + (o.price - o.cost) * o.quantity, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || store.busy) return;
    const message = text;
    setText("");
    await store.send(message);
  }

  const draftTotal = ads.filter((ad) => ad.status !== "paused").reduce((sum, ad) => sum + ad.dailyBudget, 0);
  const [budget, setBudget] = useState("");
  useEffect(() => setBudget(draftTotal ? String(Math.round(draftTotal * 100) / 100) : ""), [draftTotal]);

  async function saveBudget() {
    const value = Number(budget);
    if (!Number.isFinite(value) || value <= 0 || value === draftTotal) return;
    await fetch(`/api/stores/${id}/creatives`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dailyBudget: value }),
    });
    await store.refresh();
  }

  async function testOrder(productId: string) {
    setOrdering(productId);
    await fetch(`/api/stores/${id}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    await store.refresh();
    setOrdering("");
  }

  const drafts = ads.filter((ad) => ad.status !== "paused");
  // Class names and addresses avoid the word "ad": browser ad blockers hide anything that carries it.
  const artwork = (ad: { id: string; ts: number }) =>
    `/api/stores/${id}/creatives/${ad.id.replace(/^ad-/, "")}/image?v=${ad.ts}`;
  const firstReady = listed[0];

  return (
    <main className="wide">
      <section>
        <p>
          <strong>{meta.proposal?.name}</strong> <span className="faint">· run by Clark</span>
        </p>
        <p>
          {meta.shopify && (
            <a href={meta.shopify.previewUrl} target="_blank" rel="noreferrer">
              Open the store
            </a>
          )}{" "}
          <span className="faint">{meta.shopify?.domain}</span>
        </p>
        {meta.shopify && !meta.shopify.canSell && (
          <p className="faint">
            The store cannot take payment yet.{" "}
            <a href={meta.shopify.claimUrl} target="_blank" rel="noreferrer">
              Claim it on Shopify
            </a>{" "}
            and pick a plan.
          </p>
        )}

        <div className="block">
          {products.length} products · {margin}% average margin · {orders.length} orders · {money(revenue)} sales ·{" "}
          {money(profit)} profit
        </div>

        <div className="block">
          <p className="label">Products</p>
          {products.map((product) => (
            <div className="item" key={product.id}>
              {product.images[0] ? <img src={thumb(product.images[0], 128)} alt="" /> : <img alt="" />}
              <div>
                <div>{product.name}</div>
                {product.status === "generating" && <div className="faint pulse">Being made by Arcade</div>}
                {product.status === "failed" && <div className="olive plain">{product.error}</div>}
                {product.status === "ready" && product.cost !== undefined && product.price !== undefined && (
                  <div className="faint">
                    Cost you {money(product.cost)} · price {money(product.price)} · you earn{" "}
                    {money(product.price - product.cost)}
                    {!product.shopifyProductId && " · not in the store yet"}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="block">
          <p className="label">Orders</p>
          {orders.length === 0 && (
            <p className="faint">
              None yet.{" "}
              {firstReady && (
                <button className="link" onClick={() => testOrder(firstReady.id)} disabled={ordering !== ""}>
                  {ordering ? "Placing it" : "Simulate a customer order"}
                </button>
              )}{" "}
              to see how Clark gets it made and shipped.
            </p>
          )}
          {orders.map((order) => (
            <p key={order.id}>
              {clock(order.ts)} · {order.productName} · {money(order.price)}{" "}
              <span className="faint">{order.test ? "Simulated" : ""}</span>
              <br />
              {order.arcadeCheckoutUrl && (
                <>
                  <a href={order.arcadeCheckoutUrl} target="_blank" rel="noreferrer">
                    Pay Arcade {money(order.cost)} to make and ship it
                  </a>
                  <br />
                  <span className="faint">
                    You type the customer&apos;s shipping address on Arcade&apos;s checkout; Arcade ships to them. A
                    simulated order has no customer.
                  </span>
                </>
              )}
            </p>
          ))}
        </div>

        <div className="block">
          <p className="label">Meta ads</p>
          {ads.map((ad) => (
            <div className="item creative" key={ad.id}>
              <a href={artwork(ad)} target="_blank" rel="noreferrer">
                <img src={artwork(ad)} alt={ad.headline} />
              </a>
              <div>
                <div className="plain">{ad.primaryText}</div>
                <div className="faint">
                  {ad.audience} · {money(ad.dailyBudget)} a day ·{" "}
                  {ad.status === "paused" ? "Published, paused" : "Ready to publish"}
                </div>
              </div>
            </div>
          ))}
          {ads.length === 0 && (
            <p>
              <button className="link" disabled={store.busy} onClick={() => void store.send(presets[3].text)}>
                Generate ads
              </button>{" "}
              <span className="faint">· set a budget · publish</span>
            </p>
          )}
          {drafts.length > 0 && (
            <p>
              <span className="faint">Generate ads ·</span> Daily budget $
              <input
                className="price"
                inputMode="decimal"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                onBlur={saveBudget}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />{" "}
              <span className="faint">·</span> <a href="/soon">Add funds to publish</a>
            </p>
          )}
        </div>

        <div className="block log">
          <p className="label">Activity</p>
          {[...activity].reverse().slice(0, 12).map((line, index) => (
            <div key={index}>
              <span className="when">{clock(line.ts)}</span>
              <span>
                <span className="faint">{line.role}</span> {line.text}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="chat">
        <div className="chat-lines" ref={lines}>
          {chat.map((line, index) => (
            <p key={index} className={line.role === "user" ? "faint plain" : "plain"}>
              {line.text}
            </p>
          ))}
          {store.busy && store.pending && <p className="faint plain">{store.pending}</p>}
          {store.busy && store.reply && <p className="plain">{store.reply}</p>}
          {store.busy && !store.reply && (
            <p className="pulse">
              <span className="olive">Clark</span> is {store.working ? store.working.toLowerCase() : "thinking"}
            </p>
          )}
          {store.error && <p className="olive plain">{store.error}</p>}
        </div>
        <form onSubmit={submit}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask Clark for anything"
            disabled={store.busy}
          />
        </form>
        <div className="presets">
          {presets.map((preset) => (
            <button key={preset.label} className="link" disabled={store.busy} onClick={() => void store.send(preset.text)}>
              {preset.label}
            </button>
          ))}
        </div>
        <p className="faint review">
          Clark works on this store on its own every morning at 9
          {meta.lastReviewAt ? ` · last run ${clock(meta.lastReviewAt)}` : ""}.{" "}
          <button
            className="link"
            disabled={store.busy}
            onClick={() => void store.send("", { review: true, display: "Morning review" })}
          >
            Run it now
          </button>
        </p>
      </section>
    </main>
  );
}
