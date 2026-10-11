import Link from "next/link";

export const metadata = { title: "Clark — privacy" };

export default function Privacy() {
  return (
    <main className="col center">
      <p>
        <span className="olive">Clark</span> privacy
      </p>
      <p className="plain">
        Clark stores what you type when you open a store: your idea, the store&apos;s name, its products, prices and
        your conversation with Clark. It uses this only to build and run that store.
      </p>
      <p className="plain">
        Product designs are sent to Arcade to be made. The storefront is hosted by Shopify. Ads are created through
        Meta. Clark does not sell your data and does not collect payment details.
      </p>
      <p className="plain">Clark is a hackathon prototype. To have a store&apos;s data deleted, contact its owner.</p>
      <p>
        <Link href="/">Back</Link>
      </p>
    </main>
  );
}
