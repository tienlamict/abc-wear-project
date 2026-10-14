import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/account/AuthCard";
import { ResetPasswordForm } from "@/components/account/ResetPasswordForm";

export const metadata: Metadata = { title: "Đặt lại mật khẩu" };

/** MA-03: opened from the emailed link `?token=…` (valid 30 minutes). */
export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string | string[] };
}) {
  const token = typeof searchParams.token === "string" ? searchParams.token : "";

  return (
    <AuthCard title="Đặt lại mật khẩu">
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-gray-700">
          Liên kết không hợp lệ. Vui lòng mở đúng liên kết trong email, hoặc{" "}
          <Link href="/quen-mat-khau" className="underline">
            yêu cầu liên kết mới
          </Link>
          .
        </p>
      )}
    </AuthCard>
  );
}
