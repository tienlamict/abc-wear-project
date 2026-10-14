import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { getCategoryTree } from "@/modules/catalog";
import { getCurrentMemberCached } from "./_lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ABC Wear", template: "%s · ABC Wear" },
  description: "Cửa hàng thời trang ABC Wear — giao hàng toàn quốc, thanh toán khi nhận hàng.",
};

// Every page reads live data from the Selling DB (stock changes every minute).
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [categories, member] = await Promise.all([
    getCategoryTree().catch((err: unknown) => {
      console.error("[web] failed to load categories", err);
      return [];
    }),
    getCurrentMemberCached().catch((err: unknown) => {
      console.error("[web] failed to load member", err);
      return null;
    }),
  ]);

  return (
    <html lang="vi">
      <body className="flex min-h-screen flex-col bg-white text-gray-900 antialiased">
        <SiteHeader categories={categories} memberName={member?.fullName ?? null} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t py-6 text-center text-sm text-gray-500">
          ABC Wear · Giao hàng toàn quốc · Thanh toán khi nhận hàng (COD)
        </footer>
      </body>
    </html>
  );
}
