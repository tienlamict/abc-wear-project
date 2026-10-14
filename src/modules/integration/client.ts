import type { z } from "zod";
import { getConfig } from "@/lib/config";
import { type SyncLogEntry, writeSyncLog } from "./sync-log";
import {
  type CatalogSnapshot,
  type Iface,
  type MainOrderPayload,
  type StockCheckResult,
  type StockItem,
  type StockLine,
  catalogSnapshotSchema,
  sendOrderResultSchema,
  stockCheckResultSchema,
  stockSnapshotSchema,
} from "./types";

/** The only gateway to Main System. */
export interface MainSystemClient {
  fetchCatalog(): Promise<CatalogSnapshot>; // IF-01
  fetchStock(): Promise<StockItem[]>; // IF-02
  checkStock(lines: StockLine[]): Promise<StockCheckResult>; // IF-03
  sendOrder(order: MainOrderPayload): Promise<{ mainOrderId: string }>; // IF-04, idempotent on order.id
}

export type MainSystemErrorKind = "timeout" | "network" | "http" | "invalid_response";

export class MainSystemError extends Error {
  constructor(
    public readonly kind: MainSystemErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "MainSystemError";
  }
}

export interface HttpMainSystemClientOptions {
  baseUrl: string;
  timeoutMs: number;
  log?: (entry: SyncLogEntry) => Promise<void>;
}

interface CallSpec<S extends z.ZodType> {
  iface: Iface;
  direction: SyncLogEntry["direction"];
  path: string;
  schema: S;
  init?: RequestInit;
  recordKey?: string;
  summarize: (data: z.output<S>) => string;
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export class HttpMainSystemClient implements MainSystemClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly log: (entry: SyncLogEntry) => Promise<void>;

  constructor(options: HttpMainSystemClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs;
    this.log = options.log ?? writeSyncLog;
  }

  fetchCatalog(): Promise<CatalogSnapshot> {
    return this.call({
      iface: "IF-01",
      direction: "IN",
      path: "/main/catalog",
      schema: catalogSnapshotSchema,
      summarize: (d) =>
        `categories=${d.categories.length} products=${d.products.length} ` +
        `variants=${d.products.reduce((n, p) => n + p.variants.length, 0)}`,
    });
  }

  async fetchStock(): Promise<StockItem[]> {
    const data = await this.call({
      iface: "IF-02",
      direction: "IN",
      path: "/main/stock",
      schema: stockSnapshotSchema,
      summarize: (d) => `items=${d.items.length}`,
    });
    return data.items;
  }

  checkStock(lines: StockLine[]): Promise<StockCheckResult> {
    return this.call({
      iface: "IF-03",
      direction: "OUT",
      path: "/main/stock-check",
      schema: stockCheckResultSchema,
      init: jsonBody({ lines }),
      summarize: (d) =>
        d.ok
          ? `lines=${lines.length} ok`
          : `lines=${lines.length} short=${d.shortages.map((s) => s.sku).join(",")}`,
    });
  }

  sendOrder(order: MainOrderPayload): Promise<{ mainOrderId: string }> {
    return this.call({
      iface: "IF-04",
      direction: "OUT",
      path: "/main/orders",
      schema: sendOrderResultSchema,
      init: jsonBody(order),
      recordKey: order.code,
      summarize: (d) => `mainOrderId=${d.mainOrderId}`,
    });
  }

  /** One HTTP exchange with Main System = one sync_log row (OK or ERROR). */
  private async call<S extends z.ZodType>(spec: CallSpec<S>): Promise<z.output<S>> {
    const { iface, direction, recordKey } = spec;
    try {
      const data = await this.request(spec);
      await this.log({ direction, iface, recordKey, result: "OK", message: spec.summarize(data) });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.log({ direction, iface, recordKey, result: "ERROR", message });
      throw err;
    }
  }

  private async request<S extends z.ZodType>(spec: CallSpec<S>): Promise<z.output<S>> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${spec.path}`, {
        ...spec.init,
        headers: { accept: "application/json", ...spec.init?.headers },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new MainSystemError("timeout", `${spec.path}: no response after ${this.timeoutMs}ms`);
      }
      // Node's fetch wraps the socket error, e.g. an AggregateError with an empty message.
      const cause = (err instanceof Error ? (err.cause ?? err) : err) as
        (Error & { code?: string }) | undefined;
      const detail = cause?.code ?? (cause?.message || String(err));
      throw new MainSystemError("network", `${spec.path}: ${detail}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new MainSystemError(
        "http",
        `${spec.path}: HTTP ${res.status} ${body.slice(0, 200)}`.trim(),
        res.status,
      );
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new MainSystemError("invalid_response", `${spec.path}: response is not JSON`);
    }
    const parsed = spec.schema.safeParse(json);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new MainSystemError(
        "invalid_response",
        `${spec.path}: unexpected payload at ${first?.path.join(".") || "(root)"}: ${first?.message}`,
      );
    }
    return parsed.data;
  }
}

export function createMainSystemClient(): MainSystemClient {
  const config = getConfig();
  return new HttpMainSystemClient({
    baseUrl: config.MAIN_SYSTEM_URL,
    timeoutMs: config.MAIN_TIMEOUT_MS,
  });
}
