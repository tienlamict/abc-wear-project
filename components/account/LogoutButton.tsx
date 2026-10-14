"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { callApi } from "../form";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const logout = async () => {
    setPending(true);
    await callApi("/api/auth/logout");
    router.push("/");
    router.refresh();
    setPending(false);
  };

  return (
    <button type="button" onClick={logout} disabled={pending} className="hover:underline">
      Đăng xuất
    </button>
  );
}
