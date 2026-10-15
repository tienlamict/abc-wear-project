import { type EmailMessage, emailLayout, escapeHtml } from "@/lib/email";
import { formatVnd } from "@/lib/money";

export interface ConfirmationOrder {
  code: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  shipLine1: string;
  shipWard: string;
  shipDistrict: string;
  shipProvince: string;
  shippingMethodName: string;
  shippingFee: number;
  itemsTotal: number;
  codAmount: number;
  items: {
    productName: string;
    size: string;
    color: string;
    unitPrice: number;
    quantity: number;
  }[];
}

const address = (o: ConfirmationOrder) =>
  `${o.shipLine1}, ${o.shipWard}, ${o.shipDistrict}, ${o.shipProvince}`;

/** OD-04: order code, items and the COD total. */
export function orderConfirmationEmail(order: ConfirmationOrder, lookupUrl: string): EmailMessage {
  const subject = `Xác nhận đơn hàng ${order.code}`;
  const text = [
    `Xin chào ${order.customerName},`,
    "",
    `Cảm ơn bạn đã đặt hàng tại ABC Wear. Mã đơn hàng: ${order.code}`,
    "",
    "Sản phẩm:",
    ...order.items.map(
      (i) =>
        `- ${i.productName} (${i.color}, size ${i.size}) x ${i.quantity}: ${formatVnd(i.unitPrice * i.quantity)}`,
    ),
    "",
    `Tiền hàng: ${formatVnd(order.itemsTotal)}`,
    `Phí giao hàng (${order.shippingMethodName}): ${formatVnd(order.shippingFee)}`,
    `Tổng thanh toán khi nhận hàng (COD): ${formatVnd(order.codAmount)}`,
    "",
    `Giao đến: ${order.customerName}, ${order.customerPhone}`,
    address(order),
    "",
    `Tra cứu đơn hàng: ${lookupUrl} (nhập mã đơn và email ${order.customerEmail})`,
  ].join("\n");

  const rows = order.items
    .map(
      (i) => `<tr>
<td style="padding:6px 0;border-bottom:1px solid #e5e7eb">${escapeHtml(i.productName)}<br><span style="color:#6b7280;font-size:13px">${escapeHtml(i.color)} · Size ${escapeHtml(i.size)} · SL ${i.quantity}</span></td>
<td style="padding:6px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap">${formatVnd(i.unitPrice * i.quantity)}</td>
</tr>`,
    )
    .join("\n");

  const html = emailLayout(
    `Đơn hàng ${order.code} đã được xác nhận`,
    `<p>Xin chào ${escapeHtml(order.customerName)},</p>
<p>Cảm ơn bạn đã đặt hàng tại ABC Wear. Mã đơn hàng của bạn là <strong>${escapeHtml(order.code)}</strong>.</p>
<table style="width:100%;border-collapse:collapse;font-size:14px">
${rows}
<tr><td style="padding:6px 0">Tiền hàng</td><td style="padding:6px 0;text-align:right">${formatVnd(order.itemsTotal)}</td></tr>
<tr><td style="padding:6px 0">Phí giao hàng (${escapeHtml(order.shippingMethodName)})</td><td style="padding:6px 0;text-align:right">${formatVnd(order.shippingFee)}</td></tr>
<tr><td style="padding:6px 0;font-weight:bold">Thanh toán khi nhận hàng (COD)</td><td style="padding:6px 0;text-align:right;font-weight:bold">${formatVnd(order.codAmount)}</td></tr>
</table>
<p style="margin-top:16px"><strong>Giao đến:</strong> ${escapeHtml(order.customerName)}, ${escapeHtml(order.customerPhone)}<br>${escapeHtml(address(order))}</p>
<p><a href="${escapeHtml(lookupUrl)}">Tra cứu đơn hàng</a> bằng mã đơn và email ${escapeHtml(order.customerEmail)}.</p>`,
  );
  return { to: order.customerEmail, subject, text, html };
}

export interface StatusEmailOrder {
  code: string;
  customerName: string;
  customerEmail: string;
  codAmount: number;
  trackingNumber: string | null;
}

/** IF-05: tells the customer their order is on its way (SHIPPING) or has arrived (DELIVERED). */
export function orderStatusEmail(
  order: StatusEmailOrder,
  status: "SHIPPING" | "DELIVERED",
  lookupUrl: string,
): EmailMessage {
  const shipping = status === "SHIPPING";
  const subject = shipping
    ? `Đơn hàng ${order.code} đang được giao`
    : `Đơn hàng ${order.code} đã giao thành công`;
  const lines = shipping
    ? [
        `Đơn hàng ${order.code} đã được giao cho đơn vị vận chuyển.`,
        order.trackingNumber ? `Mã vận đơn: ${order.trackingNumber}` : null,
        `Vui lòng chuẩn bị ${formatVnd(order.codAmount)} để thanh toán khi nhận hàng (COD).`,
      ]
    : [`Đơn hàng ${order.code} đã được giao thành công.`, "Cảm ơn bạn đã mua sắm tại ABC Wear!"];
  const body = lines.filter((l): l is string => l !== null);

  const text = [
    `Xin chào ${order.customerName},`,
    "",
    ...body,
    "",
    `Tra cứu đơn hàng: ${lookupUrl} (nhập mã đơn và email ${order.customerEmail})`,
  ].join("\n");
  const html = emailLayout(
    subject,
    `<p>Xin chào ${escapeHtml(order.customerName)},</p>
${body.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n")}
<p><a href="${escapeHtml(lookupUrl)}">Tra cứu đơn hàng</a> bằng mã đơn và email ${escapeHtml(order.customerEmail)}.</p>`,
  );
  return { to: order.customerEmail, subject, text, html };
}
