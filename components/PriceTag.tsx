import { formatVnd } from "@/lib/money";

/** `499.000 ₫`, or `Từ 499.000 ₫` when variants differ in price. */
export function PriceTag({
  min,
  max = min,
  className = "",
}: {
  min: number;
  max?: number;
  className?: string;
}) {
  return (
    <span
      data-testid="price"
      data-price={min}
      className={`font-semibold text-gray-900 ${className}`}
    >
      {max > min ? `Từ ${formatVnd(min)}` : formatVnd(min)}
    </span>
  );
}
