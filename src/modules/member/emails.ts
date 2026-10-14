import { type EmailMessage, emailLayout, escapeHtml } from "@/lib/email";

export function passwordResetEmail(to: string, fullName: string, resetUrl: string): EmailMessage {
  const subject = "Đặt lại mật khẩu ABC Wear";
  const text = [
    `Xin chào ${fullName},`,
    "",
    "Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu tài khoản ABC Wear.",
    "Mở liên kết sau trong vòng 30 phút để đặt mật khẩu mới:",
    resetUrl,
    "",
    "Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu của bạn không thay đổi.",
  ].join("\n");
  const html = emailLayout(
    "Đặt lại mật khẩu",
    `<p>Xin chào ${escapeHtml(fullName)},</p>
<p>Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu tài khoản ABC Wear.
Bấm nút dưới đây trong vòng <strong>30 phút</strong> để đặt mật khẩu mới.</p>
<p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Đặt lại mật khẩu</a></p>
<p style="font-size:13px;color:#4b5563">Hoặc mở liên kết: ${escapeHtml(resetUrl)}</p>
<p style="font-size:13px;color:#4b5563">Nếu bạn không yêu cầu, hãy bỏ qua email này; mật khẩu của bạn không thay đổi.</p>`,
  );
  return { to, subject, text, html };
}
