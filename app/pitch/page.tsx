"use client";

import { useEffect, useState } from "react";

const slides = [
  <>
    <span className="olive">Clark</span> takes you from an idea to a real business in 5 minutes.
  </>,
  <>
    Give it your idea. It makes your products with <span className="olive">Arcade</span>, opens your{" "}
    <span className="olive">Shopify</span> store and launches your <span className="olive">Meta Ads</span>.
  </>,
  <>
    Every day, it wakes up and works on your business: products, website, ads.
    <br />
    <br />
    <span className="olive">With or without you.</span>
  </>,
];

// Three slides in the site's own style. Arrow keys, space or a click move between them.
export default function Pitch() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", " ", "Enter", "PageDown"].includes(e.key)) {
        setIndex((i) => Math.min(i + 1, slides.length - 1));
      }
      if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="slide" onClick={() => setIndex((i) => (i + 1) % slides.length)}>
      <p>{slides[index]}</p>
      <div className="slide-count">
        {index + 1} / {slides.length}
      </div>
    </main>
  );
}
