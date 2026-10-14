import { prisma } from "@/lib/db";
import { transition } from "@/lib/order-state";
import {
  type MainOrderPayload,
  type MainSystemClient,
  createMainSystemClient,
  writeSyncLog,
} from "@/modules/integration";

export const SEND_BATCH_SIZE = 20;
export const MAX_SEND_ATTEMPTS = 10;
const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10 * 60_000;

/** Wait before the next try after `attempts` failures: min(5 s × 2^attempts, 10 min). */
export function retryDelayMs(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** attempts, MAX_DELAY_MS);
}

export interface SendResult {
  sent: number;
  retrying: number;
  gaveUp: number;
}

const pendingOrderInclude = { items: true } as const;

/**
 * IF-04 (worker, every 5 s): sends CONFIRMED orders whose nextSendAt is due, oldest first,
 * 20 at a time. Success → SENT_TO_MAIN with mainOrderId; failure → retry with exponential
 * backoff; after 10 failures nextSendAt = null and an ERROR row in sync_log. Main System is
 * idempotent on the order id, so a retry after a lost response never creates a duplicate.
 */
export async function sendPendingOrders(
  client: MainSystemClient = createMainSystemClient(),
  now: () => Date = () => new Date(),
): Promise<SendResult> {
  const due = await prisma.order.findMany({
    where: { status: "CONFIRMED", nextSendAt: { lte: now() } },
    orderBy: { nextSendAt: "asc" },
    take: SEND_BATCH_SIZE,
    include: pendingOrderInclude,
  });

  const result: SendResult = { sent: 0, retrying: 0, gaveUp: 0 };
  for (const order of due) {
    const attempts = order.sendAttempts + 1;
    try {
      const { mainOrderId } = await client.sendOrder(toPayload(order));
      const next = transition(order.status, "SENT_TO_MAIN");
      // Guard on status so a concurrent change is never overwritten.
      await prisma.order.updateMany({
        where: { id: order.id, status: "CONFIRMED" },
        data: {
          status: next.status,
          mainOrderId,
          sendAttempts: attempts,
          nextSendAt: null,
          lastSendError: null,
        },
      });
      result.sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const giveUp = attempts >= MAX_SEND_ATTEMPTS;
      const nextSendAt = giveUp ? null : new Date(now().getTime() + retryDelayMs(attempts));
      await prisma.order.update({
        where: { id: order.id },
        data: { sendAttempts: attempts, nextSendAt, lastSendError: message.slice(0, 1000) },
      });
      await writeSyncLog({
        direction: "OUT",
        iface: "IF-04",
        recordKey: order.code,
        result: giveUp ? "ERROR" : "RETRY",
        message: giveUp
          ? `giving up after ${attempts} attempts: ${message}`
          : `attempt ${attempts}/${MAX_SEND_ATTEMPTS} failed, next try at ${nextSendAt!.toISOString()}`,
      });
      if (giveUp) result.gaveUp++;
      else result.retrying++;
    }
  }
  return result;
}

type PendingOrder = Awaited<
  ReturnType<typeof prisma.order.findMany<{ include: typeof pendingOrderInclude }>>
>[number];

function toPayload(order: PendingOrder): MainOrderPayload {
  return {
    id: order.id,
    code: order.code,
    createdAt: order.createdAt.toISOString(),
    customer: { name: order.customerName, email: order.customerEmail, phone: order.customerPhone },
    shippingAddress: {
      line1: order.shipLine1,
      ward: order.shipWard,
      district: order.shipDistrict,
      province: order.shipProvince,
    },
    shippingMethod: order.shippingMethod,
    shippingFee: order.shippingFee,
    itemsTotal: order.itemsTotal,
    codAmount: order.codAmount,
    items: order.items.map((i) => ({
      sku: i.sku,
      productName: i.productName,
      size: i.size,
      color: i.color,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
    })),
  };
}
