"use client";

import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="py-16 text-center">
      <h1 className="text-xl font-semibold">Đã có lỗi xảy ra</h1>
      <p className="mt-2 text-gray-600">Trang chưa tải được. Vui lòng thử lại sau ít phút.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        Thử lại
      </button>
    </div>
  );
}
