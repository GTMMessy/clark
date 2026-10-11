"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewStoreForm() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [name, setName] = useState("");
  const [inspiration, setInspiration] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!idea.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, name, inspiration }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not create the store");
      const { id } = await res.json();
      router.push(`/store/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <main className="col center">
      <form onSubmit={submit}>
        <label>
          What do you want to sell?
          <textarea
            autoFocus
            rows={2}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Table linen for long Mediterranean lunches"
          />
        </label>
        <label>
          What is it called? <span className="faint">Optional</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Clark will suggest a name" />
        </label>
        <label>
          What should it look like? <span className="faint">Optional</span>
          <input
            value={inspiration}
            onChange={(e) => setInspiration(e.target.value)}
            placeholder="Hand-painted, cobalt and lemon yellow, a little retro"
          />
        </label>
        <p className="faint">
          Clark can make table linen, pillows, bedding, curtains, lampshades, scarves, fabric and jewelry.
        </p>
        <p>
          <button className="link" type="submit" disabled={!idea.trim() || busy}>
            {busy ? "Opening" : "Continue"}
          </button>
        </p>
        {error && <p className="olive plain">{error}</p>}
      </form>
    </main>
  );
}
