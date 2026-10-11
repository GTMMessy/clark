import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--mono" });

export const metadata: Metadata = {
  title: "Clark — your shopkeeper",
  description: "Tell Clark what you want to sell. It designs the products, opens your store and runs it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mono.variable}>
      <body>{children}</body>
    </html>
  );
}
