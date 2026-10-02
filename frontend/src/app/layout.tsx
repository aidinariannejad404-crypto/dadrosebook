import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";
import { getCategories } from "@/lib/api";
import type { CategoryNode } from "@/lib/types";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/config";
import { Header } from "@/components/layout/Header";
import { CategoryNav } from "@/components/layout/CategoryNav";
import { Footer } from "@/components/layout/Footer";

const vazirmatn = localFont({
  src: "../fonts/Vazirmatn-wght.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-vazirmatn",
  preload: true,
  fallback: ["Tahoma", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${SITE_NAME} | منابع آزمون وکالت و قضاوت`, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    locale: "fa_IR",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#12264A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

async function loadCategories(): Promise<CategoryNode[]> {
  try {
    return await getCategories();
  } catch {
    // The nav is not worth failing the page for (e.g. API down while building static pages).
    return [];
  }
}

export default async function RootLayout({ children, topbar }: { children: ReactNode; topbar: ReactNode }) {
  const categories = await loadCategories();
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-control bg-accent px-4 py-3 font-bold text-ink focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          پرش به محتوای اصلی
        </a>
        {topbar}
        <Header />
        <CategoryNav categories={categories} />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
