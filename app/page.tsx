import Link from "next/link";

export default function Home() {
  return (
    <main className="col center">
      <p>
        <span className="olive">Clark</span> is a shopkeeper. Tell it what you want to sell and it designs the
        products, opens your Shopify store and runs it.
      </p>
      <p>
        Nothing to stock: every product is made to order by Arcade&apos;s makers and shipped straight to your
        customer.
      </p>
      <p>
        Ask it for a new product, a new look or an ad campaign. It does the work, and tells you what it costs and
        what you earn.
      </p>
      <p>
        <Link href="/new">Open a store</Link>
      </p>
    </main>
  );
}
