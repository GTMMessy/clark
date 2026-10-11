"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Activity, Ad, ChatLine, Order, Product, StoreMeta } from "@/lib/types";

export type StoreState = {
  meta: Omit<StoreMeta, "shopify" | "metaAds"> & {
    shopify?: { domain: string; previewUrl: string; claimUrl: string; canSell: boolean };
  };
  products: Product[];
  activity: Activity[];
  orders: Order[];
  ads: Ad[];
  chat: ChatLine[];
};

export type StoreApi = {
  state: StoreState | null;
  missing: boolean;
  busy: boolean;
  working: string;
  reply: string;
  pending: string;
  error: string;
  refresh: () => Promise<void>;
  send: (text: string, options?: { kickoff?: boolean; review?: boolean; display?: string }) => Promise<void>;
};

// The access code can change or expire while a store is open; send the owner back to enter it.
function askForAccess() {
  window.location.href = `/access?next=${encodeURIComponent(window.location.pathname)}`;
}

export function useStore(id: string): StoreApi {
  const [state, setState] = useState<StoreState | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState("");
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const kicked = useRef(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/stores/${id}`, { cache: "no-store" });
    if (res.status === 401) return askForAccess();
    if (res.status === 404) return setMissing(true);
    if (res.ok) setState(await res.json());
  }, [id]);

  const send = useCallback(
    async (text: string, options?: { kickoff?: boolean; review?: boolean; display?: string }) => {
      // Show the owner's message at once, before Clark has answered.
      setPending(options?.kickoff ? "" : (options?.display ?? text));
      setBusy(true);
      setReply("");
      setWorking("");
      setError("");
      try {
        const res = await fetch(`/api/stores/${id}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, kickoff: options?.kickoff, review: options?.review }),
        });
        if (res.status === 401) return askForAccess();
        if (!res.body || !res.headers.get("content-type")?.includes("ndjson")) {
          const body = await res.json().catch(() => null);
          if (!body?.skipped) setError(body?.error ?? "Clark could not be reached. Try again.");
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event.type === "text") setReply((r) => r + event.delta);
            if (event.type === "tool") {
              setWorking(event.label);
              setReply("");
              void refresh();
            }
            if (event.type === "error") setError(event.message);
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        await refresh();
        setBusy(false);
        setPending("");
        setWorking("");
        setReply("");
      }
    },
    [id, refresh],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The first message is the brief from the opening screen.
  useEffect(() => {
    if (!state || kicked.current || state.meta.kickedOff) return;
    kicked.current = true;
    void send("", { kickoff: true });
  }, [state, send]);

  const waiting =
    state &&
    (busy ||
      (state.meta.phase === "proposal" && !state.meta.proposal) ||
      state.meta.phase === "launching" ||
      state.products.some((p) => p.status === "generating"));
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [waiting, refresh]);

  return { state, missing, busy, working, reply, pending, error, refresh, send };
}
