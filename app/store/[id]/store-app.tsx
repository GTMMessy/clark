"use client";

import Link from "next/link";
import { useState } from "react";
import { CommandCenter } from "./command-center";
import { LaunchScreen } from "./launch";
import { ProductsScreen } from "./products";
import { ProposalScreen } from "./proposal";
import { useStore } from "./use-store";

export function StoreApp({ id }: { id: string }) {
  const store = useStore(id);
  const [launching, setLaunching] = useState(false);

  if (store.missing) {
    return (
      <main className="col center">
        <p>This store does not exist.</p>
        <p>
          <Link href="/new">Open a store</Link>
        </p>
      </main>
    );
  }
  if (!store.state) return <main className="col center" />;

  const { phase } = store.state.meta;
  if (phase === "live") return <CommandCenter id={id} store={store} />;
  if (phase === "launching" || launching) return <LaunchScreen store={store} />;
  if (phase === "proposal") return <ProposalScreen id={id} store={store} />;
  return (
    <ProductsScreen
      id={id}
      store={store}
      onLaunch={() => {
        setLaunching(true);
        void store.send("Launch the store.");
      }}
    />
  );
}
