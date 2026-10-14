const LOW_STOCK = 5;

/** QT6: "Tạm hết hàng" when the variant cannot be sold. */
export function StockBadge({ qty, purchasable }: { qty: number; purchasable: boolean }) {
  if (!purchasable)
    return (
      <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
        Tạm hết hàng
      </span>
    );
  if (qty <= LOW_STOCK)
    return (
      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
        Chỉ còn {qty} sản phẩm
      </span>
    );
  return (
    <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
      Còn hàng
    </span>
  );
}
