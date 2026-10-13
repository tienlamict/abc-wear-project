import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ABC Wear",
  description: "Cửa hàng thời trang ABC Wear — giao hàng toàn quốc, thanh toán khi nhận hàng.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-white text-gray-900 antialiased">{children}</body>
    </html>
  );
}
