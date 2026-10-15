import Link from "next/link";

export default function OrderNotFound() {
  return (
    <div className="py-12 text-center">
      <h1 className="text-xl font-semibold">Không tìm thấy đơn</h1>
      <p className="mt-2 text-gray-600">
        Đơn hàng không tồn tại hoặc không thuộc tài khoản của bạn.
      </p>
      <Link
        href="/tai-khoan/don-hang"
        className="mt-6 inline-block rounded bg-gray-900 px-4 py-2 text-sm text-white"
      >
        Xem đơn hàng của tôi
      </Link>
    </div>
  );
}
