import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
      <p className="mt-2 text-gray-600">
        Sản phẩm hoặc danh mục có thể đã ngừng kinh doanh, hoặc đường dẫn chưa đúng.
      </p>
      <Link href="/" className="mt-6 inline-block rounded bg-gray-900 px-4 py-2 text-sm text-white">
        Về trang chủ
      </Link>
    </div>
  );
}
