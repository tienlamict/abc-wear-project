"use client";

import { useEffect } from "react";

/** Last resort when the root layout itself fails; replaces the whole document. */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <html lang="vi">
      <body
        style={{ fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "4rem 1rem" }}
      >
        <h1 style={{ fontSize: "1.25rem" }}>ABC Wear đang gặp sự cố</h1>
        <p style={{ color: "#4b5563" }}>Trang chưa tải được. Vui lòng thử lại sau ít phút.</p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "1.5rem",
            padding: "0.5rem 1rem",
            background: "#111827",
            color: "#fff",
            borderRadius: 4,
          }}
        >
          Thử lại
        </button>
      </body>
    </html>
  );
}
