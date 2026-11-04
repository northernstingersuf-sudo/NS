import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Ticker from "@/components/Ticker";
import { CartProvider } from "@/components/CartProvider";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://northernstingers.se"),
  title: { default: "Northern Stingers – fiske och livsstil", template: "%s | Northern Stingers" },
  description: "Egna fiskeprodukter, kläder och livsstilsprodukter från Northern Stingers.",
  icons: { icon: "/logo/n-black-on-white.webp" },
  openGraph: { siteName: "Northern Stingers", locale: "sv_SE", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={sans.variable}>
      <body className="font-sans">
        <CartProvider>
          <Ticker />
          <Header />
          <main>{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
