"use client";

import { useEffect, useState } from "react";
import { thumb } from "@/lib/thumb";
import type { Product } from "@/lib/types";
import type { StoreApi } from "./use-store";

const money = (n: number) => `$${n.toFixed(2)}`;

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <>
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
    </>
  );
}

function ProductRow({ id, product, store }: { id: string; product: Product; store: StoreApi }) {
  const refresh = store.refresh;
  const [feedback, setFeedback] = useState("");
  const [sent, setSent] = useState("");
  const [price, setPrice] = useState(product.price ? String(product.price) : "");
  useEffect(() => setPrice(product.price ? String(product.price) : ""), [product.price]);

  async function savePrice() {
    const value = Number(price);
    if (!Number.isFinite(value) || value <= 0 || value === product.price) return;
    await fetch(`/api/stores/${id}/products`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, price: value }),
    });
    await refresh();
  }

  async function regenerate() {
    await fetch(`/api/stores/${id}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerate: product.id }),
    });
    await refresh();
  }

  async function sendFeedback(e: React.FormEvent) {
    e.preventDefault();
    if (!feedback.trim() || store.busy) return;
    const text = feedback;
    setFeedback("");
    setSent(text);
    await store.send(`Feedback on the product "${product.name}" (id ${product.id}): ${text}`);
    setSent("");
  }

  const earn = product.cost && Number(price) > 0 ? Number(price) - product.cost : null;

  return (
    <div className="row">
      {product.images[0] ? (
        <img className="thumb" src={thumb(product.images[1] ?? product.images[0], 640)} alt={product.name} />
      ) : (
        <div className={`thumb empty ${product.status === "generating" ? "pulse" : ""}`}>
          {product.status === "generating" ? <Elapsed since={product.createdAt} /> : "—"}
        </div>
      )}
      <div>
        <div>{product.name}</div>
        <div className="faint">{product.title ?? product.categoryName}</div>
        {product.status === "generating" && <p className="faint">Arcade&apos;s makers are designing it</p>}
        {product.status === "failed" && (
          <>
            <p className="olive plain">{product.error}</p>
            <button className="link" onClick={regenerate}>
              Try again
            </button>
          </>
        )}
        {product.status === "ready" && product.cost !== undefined && (
          <>
            <br />
            <div>Cost you {money(product.cost)} made and shipped</div>
            <div>
              Your price $
              <input
                className="price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={savePrice}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
            </div>
            <div className={earn !== null && earn <= 0 ? "olive" : ""}>
              {earn === null
                ? "Set a price"
                : `You earn ${money(earn)} a sale · ${Math.round((earn / Number(price)) * 100)}% margin`}
            </div>
            {sent && (
              <div style={{ marginTop: 18 }}>
                <div className="faint plain">{sent}</div>
                <div className="pulse">
                  <span className="olive">Clark</span> is {store.working ? store.working.toLowerCase() : "reading your note"}
                </div>
              </div>
            )}
            <form onSubmit={sendFeedback} style={{ marginTop: 18, display: sent ? "none" : "block" }}>
              <input
                style={{ marginBottom: 0 }}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Tell Clark what to change, then press enter"
                disabled={store.busy}
              />
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export function ProductsScreen({ id, store, onLaunch }: { id: string; store: StoreApi; onLaunch: () => void }) {
  const { meta, products } = store.state!;
  const generating = products.filter((p) => p.status === "generating").length;
  const ready = products.filter((p) => p.status === "ready").length;
  const [name, setName] = useState(meta.proposal?.name ?? "");

  async function saveName() {
    if (!name.trim() || name === meta.proposal?.name) return;
    await fetch(`/api/stores/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await store.refresh();
  }

  return (
    <main className="col page">
      <div className="block tight">
        <div className="label">Store name</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <p>{generating ? `Making ${generating} of ${products.length} products` : "Your products and prices"}</p>
      <br />
      {products.map((product) => (
        <ProductRow key={product.id} id={id} product={product} store={store} />
      ))}
      {!store.busy && store.state!.chat.length > 2 && (
        <p className="plain">{store.state!.chat[store.state!.chat.length - 1].text}</p>
      )}
      {store.error && <p className="olive plain">{store.error}</p>}
      <p>
        <button className="link" onClick={onLaunch} disabled={!ready || generating > 0 || store.busy}>
          Launch the store
        </button>{" "}
        {generating > 0 && <span className="faint">When the products are ready</span>}
      </p>
    </main>
  );
}
