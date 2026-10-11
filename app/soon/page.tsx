"use client";

import { useRouter } from "next/navigation";

export default function Soon() {
  const router = useRouter();
  return (
    <main className="col center">
      <p>
        <span className="olive">Soon</span> :)
      </p>
      <p>
        Your ads are already ready to be published via Clark&apos;s Meta Ads campaign, but payment is yet to be set
        up.
      </p>
      <p>
        You will fund your ads here and Clark will publish them to Facebook and Instagram, capped at the daily budget
        you set.
      </p>
      <p>
        <button className="link" onClick={() => router.back()}>
          Back to the store
        </button>
      </p>
    </main>
  );
}
