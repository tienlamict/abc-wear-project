import Link from "next/link";
import type { CategoryNode } from "@/modules/catalog";
import { CategoryMenu } from "./CategoryMenu";
import { LogoutButton } from "./account/LogoutButton";

/** Shown on every page: logo, search, cart, account, order lookup, categories. */
export function SiteHeader({
  categories,
  memberName,
}: {
  categories: CategoryNode[];
  memberName: string | null;
}) {
  return (
    <header className="relative border-b bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="text-xl font-bold tracking-tight">
          ABC Wear
        </Link>

        <form
          action="/tim-kiem"
          method="get"
          role="search"
          className="order-last flex w-full md:order-none md:w-auto md:flex-1"
        >
          <input
            type="search"
            name="q"
            placeholder="Tìm áo thun, quần jeans, váy…"
            aria-label="Từ khóa tìm kiếm"
            maxLength={100}
            className="min-w-0 flex-1 rounded-l border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-r bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            Tìm
          </button>
        </form>

        <nav
          aria-label="Tài khoản"
          className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 whitespace-nowrap text-sm sm:gap-x-4 md:ml-0"
        >
          <Link href="/tra-cuu-don" className="hover:underline">
            Tra cứu đơn
          </Link>
          {memberName ? (
            <>
              <Link
                href="/tai-khoan"
                data-testid="member-name"
                className="max-w-28 truncate font-medium hover:underline sm:max-w-40"
                title={memberName}
              >
                {memberName}
              </Link>
              <LogoutButton />
            </>
          ) : (
            <Link href="/dang-nhap" className="hover:underline">
              Đăng nhập
            </Link>
          )}
          <Link href="/gio-hang" className="hover:underline">
            Giỏ hàng (<span data-testid="cart-count">0</span>)
          </Link>
        </nav>
      </div>
      <div className="mx-auto flex max-w-6xl items-center px-4 pb-2 md:pb-0">
        <CategoryMenu categories={categories} />
      </div>
    </header>
  );
}
