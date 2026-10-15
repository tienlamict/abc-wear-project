import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { getConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { sendEmailInBackground } from "@/lib/email";
import { AppError } from "@/lib/errors";
import { transition } from "@/lib/order-state";
import { writeSyncLog } from "@/modules/integration";
import { orderStatusEmail } from "./emails";

const statusUpdateSchema = z.object({
  mainOrderId: z.string().trim().min(1).max(64),
  status: z.enum(OrderStatus),
  trackingNumber: z.string().trim().min(1).max(64).nullish(),
});

export interface StatusUpdateResult {
  /** changed: applied; unchanged: repeat of the current status (ignored); invalid: ignored. */
  result: "changed" | "unchanged" | "invalid";
  code: string;
  status: OrderStatus;
}

const log = (result: "OK" | "ERROR", message: string, recordKey?: string) =>
  writeSyncLog({ direction: "IN", iface: "IF-05", recordKey, result, message });

/**
 * IF-05 (spec §9.3): applies a status pushed by Main System through transition(). A repeat of
 * the current status is a no-op (idempotent); an invalid move is ignored and logged as ERROR.
 * Moving to SHIPPING or DELIVERED emails the customer (email failures are only logged).
 */
export async function applyStatusUpdate(input: unknown, attempt = 1): Promise<StatusUpdateResult> {
  const parsed = statusUpdateSchema.safeParse(input);
  if (!parsed.success) {
    await log("ERROR", `invalid payload: ${JSON.stringify(input).slice(0, 300)}`);
    throw parsed.error;
  }
  const { mainOrderId, status, trackingNumber } = parsed.data;

  // Newest first: should Main ever reuse an id, the latest order is the one it means.
  const order = await prisma.order.findFirst({
    where: { mainOrderId },
    orderBy: { createdAt: "desc" },
  });
  if (!order) {
    await log("ERROR", `unknown mainOrderId ${mainOrderId} (status ${status})`);
    throw new AppError("NOT_FOUND", "Không tìm thấy đơn.");
  }

  const t = transition(order.status, status);
  if (t.kind === "invalid") {
    await log("ERROR", `ignored: ${t.reason}`, order.code);
    return { result: "invalid", code: order.code, status: order.status };
  }
  if (t.kind === "unchanged") {
    if (trackingNumber && trackingNumber !== order.trackingNumber) {
      await prisma.order.update({ where: { id: order.id }, data: { trackingNumber } });
    }
    await log("OK", `unchanged ${status}`, order.code);
    return { result: "unchanged", code: order.code, status: order.status };
  }

  // Guard on the status we read, so two concurrent updates cannot both apply.
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { status: t.status, trackingNumber: trackingNumber ?? order.trackingNumber },
  });
  if (count === 0) {
    if (attempt >= 3) throw new Error(`order ${order.code} keeps changing; giving up`);
    return applyStatusUpdate(input, attempt + 1); // re-read and decide again
  }
  await log("OK", `${order.status} → ${t.status}`, order.code);
  console.log(`[order] ${order.code} ${order.status} → ${t.status}`);

  if (t.status === "SHIPPING" || t.status === "DELIVERED") {
    const lookup = new URL("/tra-cuu-don", getConfig().WEB_BASE_URL);
    lookup.searchParams.set("code", order.code);
    sendEmailInBackground(
      orderStatusEmail(
        { ...order, trackingNumber: trackingNumber ?? order.trackingNumber },
        t.status,
        lookup.toString(),
      ),
      `${t.status} ${order.code}`,
    );
  }
  return { result: "changed", code: order.code, status: t.status };
}
