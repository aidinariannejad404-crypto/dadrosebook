import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";
import { fixturesEnabled, getCategories, getExamTypes, getStoreSettings, getSubjects } from "@/lib/api";
import type { CategoryNode, ExamTypeMini, StoreSettings, SubjectMini } from "@/lib/types";
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from "@/lib/config";
import { DEFAULT_OPEN_GRAPH, INDEX } from "@/lib/seo";
import { Umami } from "@/components/analytics/Umami";
import { Header } from "@/components/layout/Header";
import { CategoryNav } from "@/components/layout/CategoryNav";
import { Footer } from "@/components/layout/Footer";
import { HideOn } from "@/components/layout/HideOn";
import { BottomNav } from "@/components/layout/BottomNav";
import { CheckoutFooter, CheckoutHeader } from "@/components/layout/CheckoutChrome";
import { CartProvider } from "@/components/cart/CartProvider";

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
  // Indexable by default; personal/transactional routes override with NOINDEX (src/lib/seo.ts).
  robots: INDEX,
  openGraph: DEFAULT_OPEN_GRAPH,
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
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

/** Exam types × subjects for the desktop mega menu and the mobile «دسته‌ها» sheet. */
async function loadBrowse(): Promise<{ examTypes: ExamTypeMini[]; subjects: SubjectMini[] }> {
  const [examTypes, subjects] = await Promise.all([
    getExamTypes().catch(() => [] as ExamTypeMini[]),
    getSubjects().catch(() => [] as SubjectMini[]),
  ]);
  return { examTypes, subjects };
}

async function loadStore(): Promise<StoreSettings | null> {
  try {
    return await getStoreSettings();
  } catch {
    // Without settings the footer simply hides the store-driven parts (no placeholder claims).
    return null;
  }
}

export default async function RootLayout({ children, topbar }: { children: ReactNode; topbar: ReactNode }) {
  const [categories, store, browse] = await Promise.all([loadCategories(), loadStore(), loadBrowse()]);
  // the enclosed checkout (not /checkout/result) gets a minimal header/footer instead of the site chrome
  const enclosed = { exact: ["/checkout"] };
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <a
          href="#main"
          className="sr-only z-50 rounded-control bg-accent px-4 py-3 font-bold text-ink focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
        >
          پرش به محتوای اصلی
        </a>
        <CartProvider fixtures={fixturesEnabled()}>
          {topbar}
          <HideOn {...enclosed} fallback={<CheckoutHeader />}>
            <Header fixtures={fixturesEnabled()} />
            <CategoryNav categories={categories} examTypes={browse.examTypes} subjects={browse.subjects} />
          </HideOn>
          <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <HideOn {...enclosed} fallback={<CheckoutFooter />}>
            <Footer store={store} examTypes={browse.examTypes} />
          </HideOn>
          <BottomNav categories={categories} examTypes={browse.examTypes} subjects={browse.subjects} />
          <Umami />
        </CartProvider>
      </body>
    </html>
  );
}
