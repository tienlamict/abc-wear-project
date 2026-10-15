"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/tai-khoan", label: "Hồ sơ", match: (p: string) => p === "/tai-khoan" },
  {
    href: "/tai-khoan/don-hang",
    label: "Đơn hàng của tôi",
    match: (p: string) => p.startsWith("/tai-khoan/don-hang"),
  },
];

export function AccountTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Tài khoản của tôi" className="mb-6 flex gap-1 border-b">
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              active
                ? "border-gray-900 text-gray-900"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
