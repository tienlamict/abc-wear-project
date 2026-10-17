/** What changed in Main: stock only, or anything else about the catalog. */
export type ChangeType = "catalog" | "stock";

export interface SyncOutcome {
  at: string;
  type: ChangeType;
  ok: boolean;
  /** Shown as-is on the admin page. */
  message: string;
  /** The website's answer when it synced: `{ synced, products, variants, durationMs }`. */
  result?: unknown;
}

export interface NotifierOptions {
  /** The website's `/api/integration/catalog-changed`; unset → nothing is sent. */
  url?: string;
  secret?: string;
  timeoutMs?: number;
}

const NOT_SYNCED = "Chưa đồng bộ được sang website";

/**
 * Asks the website to sync now after a change in Main (spec §9.5). A failure never undoes the
 * change: the data stays in Main and the worker's periodic sync picks it up later.
 */
export class Notifier {
  last: SyncOutcome | null = null;
  /** Demo/test switch (`POST /sim/catalog-webhook`): pretend the website is unreachable. */
  enabled = true;

  constructor(private readonly options: NotifierOptions) {}

  async notify(type: ChangeType): Promise<SyncOutcome> {
    const outcome = await this.send(type);
    this.last = outcome;
    if (!outcome.ok) console.warn(`[mock-main] catalog-changed (${type}): ${outcome.message}`);
    return outcome;
  }

  private async send(type: ChangeType): Promise<SyncOutcome> {
    const at = new Date().toISOString();
    const fail = (reason: string): SyncOutcome => ({
      at,
      type,
      ok: false,
      message: `${NOT_SYNCED}: ${reason}. Dữ liệu đã lưu ở Main; website sẽ cập nhật ở lần đồng bộ định kỳ.`,
    });

    if (!this.options.url) return fail("chưa cấu hình địa chỉ website");
    if (!this.enabled) return fail("website không truy cập được (giả lập)");

    let res: Response;
    try {
      res = await fetch(this.options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-main-secret": this.options.secret ?? "",
        },
        body: JSON.stringify({ type }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch (err) {
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      return fail(timedOut ? "website không phản hồi sau 10 giây" : "website không truy cập được");
    }

    const body = (await res.json().catch(() => null)) as {
      products?: number;
      variants?: number;
      durationMs?: number;
      error?: { message?: string };
    } | null;
    if (!res.ok) return fail(body?.error?.message ?? `website trả lỗi HTTP ${res.status}`);
    return {
      at,
      type,
      ok: true,
      message:
        type === "stock"
          ? `Đã đồng bộ tồn kho sang website (${body?.variants ?? "?"} biến thể, ${body?.durationMs ?? "?"} ms).`
          : `Đã đồng bộ sang website: ${body?.products ?? "?"} sản phẩm, ${body?.variants ?? "?"} biến thể (${body?.durationMs ?? "?"} ms).`,
      result: body,
    };
  }
}
