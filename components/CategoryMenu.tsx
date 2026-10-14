"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { CategoryNode } from "@/modules/catalog/queries";

/** Desktop: one row of parent categories with a hover/focus dropdown. Mobile: a menu button. */
export function CategoryMenu({ categories }: { categories: CategoryNode[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-categories"
        className="rounded border border-gray-300 px-3 py-1.5 text-sm md:hidden"
      >
        ☰ Danh mục
      </button>
      {open && (
        <nav
          id="mobile-categories"
          aria-label="Danh mục"
          className="absolute inset-x-0 top-full z-20 border-b bg-white px-4 py-3 shadow md:hidden"
        >
          <ul className="space-y-3">
            {categories.map((parent) => (
              <li key={parent.id}>
                <Link href={`/danh-muc/${parent.slug}`} className="font-semibold">
                  {parent.name}
                </Link>
                <ul className="mt-1 space-y-1 pl-4">
                  {parent.children.map((child) => (
                    <li key={child.id}>
                      <Link href={`/danh-muc/${child.slug}`} className="text-sm text-gray-700">
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <nav aria-label="Danh mục sản phẩm" className="hidden md:block">
        <ul className="flex gap-6">
          {categories.map((parent) => (
            <li key={parent.id} className="group relative">
              <Link
                href={`/danh-muc/${parent.slug}`}
                className={`block py-2 text-sm font-medium hover:text-gray-600 ${
                  pathname === `/danh-muc/${parent.slug}` ? "underline underline-offset-4" : ""
                }`}
              >
                {parent.name}
              </Link>
              {parent.children.length > 0 && (
                <ul className="invisible absolute left-0 top-full z-20 min-w-48 rounded border bg-white py-2 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                  {parent.children.map((child) => (
                    <li key={child.id}>
                      <Link
                        href={`/danh-muc/${child.slug}`}
                        className="block px-4 py-1.5 text-sm hover:bg-gray-50"
                      >
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
