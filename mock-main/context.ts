import type { ImageStorage } from "./minio";
import type { Notifier } from "./notify";
import type { Store } from "./store";

export const FAIL_MODES = ["none", "error", "timeout"] as const;
export type FailMode = (typeof FAIL_MODES)[number];

export interface FailState {
  mode: FailMode;
  /** Fail only this many more requests, then back to "none"; null = until switched off. */
  remaining: number | null;
  /** Only requests whose path starts with this. */
  only: string | null;
}

export const NO_FAILURE: FailState = { mode: "none", remaining: null, only: null };

/** State shared by the route groups of one mock Main System instance. */
export interface MockContext {
  store: Store;
  /** null when MinIO is not configured: image uploads answer 503. */
  storage: ImageStorage | null;
  notifier: Notifier;
  /** Public URL for a MinIO object key. */
  imageUrl(key: string): string;
  /** Simulated outage of the website-facing API (/main/*). */
  fail: FailState;
  /** How long a request hangs in fail-mode "timeout". */
  hangMs: number;
  /** IF-05 target and its shared secret. */
  orderWebhook: { url?: string; secret?: string };
  /** Main order ids stay unique across restarts, like a real Main System's. */
  bootId: string;
}
