"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function AccessForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim() || busy) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      // Only follow links back into this site.
      router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/new");
    } else {
      setError((await res.json()).error ?? "That access code is not right.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <p>
        <span className="olive">Clark</span> is open to invited testers.
      </p>
      <label>
        Access code
        <input
          autoFocus
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="off"
        />
      </label>
      <p>
        <button className="link" type="submit" disabled={!password.trim() || busy}>
          {busy ? "Checking" : "Enter"}
        </button>
      </p>
      {error && <p className="olive plain">{error}</p>}
    </form>
  );
}

export default function Access() {
  return (
    <main className="col center">
      <Suspense>
        <AccessForm />
      </Suspense>
    </main>
  );
}
