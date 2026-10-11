"use client";

import { useEffect, useState } from "react";
import type { Proposal } from "@/lib/types";
import type { StoreApi } from "./use-store";

export function ProposalScreen({ id, store }: { id: string; store: StoreApi }) {
  const saved = store.state!.meta.proposal;
  const [draft, setDraft] = useState<Proposal | undefined>(saved);
  const [ask, setAsk] = useState("");
  const [making, setMaking] = useState(false);

  // A new proposal from Clark replaces the owner's draft.
  useEffect(() => setDraft(saved), [saved]);

  if (!draft) {
    return (
      <main className="col center">
        <p className="pulse">
          <span className="olive">Clark</span> is {store.working ? store.working.toLowerCase() : "reading your brief"}
        </p>
        {store.error && <p className="olive plain">{store.error}</p>}
      </main>
    );
  }

  const setProduct = (index: number, patch: Partial<Proposal["products"][number]>) =>
    setDraft({ ...draft, products: draft.products.map((p, i) => (i === index ? { ...p, ...patch } : p)) });

  async function make() {
    setMaking(true);
    await fetch(`/api/stores/${id}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal: draft }),
    });
    await store.refresh();
  }

  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (!ask.trim() || store.busy) return;
    const text = ask;
    setAsk("");
    await store.send(text);
  }

  return (
    <main className="col page">
      <p>
        <span className="olive">Clark</span> proposes
      </p>

      <div className="block tight">
        <div className="label">Name</div>
        <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <div className="label">Headline</div>
        <input value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} />
      </div>

      <div className="block">
        <p className="plain">{draft.concept}</p>
        <p className="plain">{draft.style}</p>
        <p>
          {Object.values(draft.palette).map((colour) => (
            <span key={colour} style={{ marginRight: 18 }}>
              <span className="swatch" style={{ background: colour }} />
              {colour}
            </span>
          ))}
        </p>
        {draft.note && <p className="olive plain">{draft.note}</p>}
      </div>

      {draft.products.map((product, index) => (
        <div className="block tight" key={index}>
          <div className="label">
            {index + 1}. {product.categoryName}
          </div>
          <input value={product.name} onChange={(e) => setProduct(index, { name: e.target.value })} />
          <textarea
            rows={3}
            value={product.prompt}
            onChange={(e) => setProduct(index, { prompt: e.target.value })}
          />
        </div>
      ))}

      <form onSubmit={change}>
        <input
          value={ask}
          onChange={(e) => setAsk(e.target.value)}
          placeholder="Tell Clark what to change, then press enter"
          disabled={store.busy}
        />
      </form>
      {store.busy && (
        <>
          {store.pending && <p className="faint plain">{store.pending}</p>}
          <p className="pulse">
            <span className="olive">Clark</span> is {store.working ? store.working.toLowerCase() : "thinking"}
          </p>
        </>
      )}
      {store.error && <p className="olive plain">{store.error}</p>}

      <p>
        <button className="link" onClick={make} disabled={making || store.busy}>
          {making ? "Sending to the makers" : "Make these products"}
        </button>{" "}
        <span className="faint">About two minutes</span>
      </p>
    </main>
  );
}
