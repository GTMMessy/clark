"use client";

import type { StoreApi } from "./use-store";

export const clock = (ts: number) =>
  new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

export function LaunchScreen({ store }: { store: StoreApi }) {
  const { meta, activity } = store.state!;
  return (
    <main className="col page">
      <p>
        <span className="olive">Clark</span> is launching {meta.proposal?.name}
      </p>
      <div className="log block">
        {activity.map((line, index) => (
          <div key={index}>
            <span className="when">{clock(line.ts)}</span>
            <span>
              <span className="faint">{line.role}</span> {line.text}
            </span>
          </div>
        ))}
      </div>
      {store.busy && <p className="pulse">{store.working || "Working"}</p>}
      {store.error && <p className="olive plain">{store.error}</p>}
      {!store.busy && (
        <p>
          <button className="link" onClick={() => void store.send("Continue launching the store.")}>
            Continue the launch
          </button>
        </p>
      )}
    </main>
  );
}
