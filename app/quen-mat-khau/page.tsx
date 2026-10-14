import type { Metadata } from "next";
import { AuthCard } from "@/components/account/AuthCard";
import { ForgotPasswordForm } from "@/components/account/ForgotPasswordForm";

export const metadata: Metadata = { title: "Quên mật khẩu" };

/** MA-03 */
export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Quên mật khẩu"
      intro="Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết để bạn đặt mật khẩu mới."
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
