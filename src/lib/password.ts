import { Worker } from "node:worker_threads";
import bcrypt from "bcryptjs";

// bcryptjs (spec §4) is pure JavaScript: a cost-10 hash or compare takes ~90 ms of CPU and, even
// through its async API, only yields every 100 ms. On the request thread one login would stall
// every other request of the process, so the work runs on a worker thread instead.

export const BCRYPT_ROUNDS = 10;

type JobInput =
  { op: "hash"; password: string } | { op: "compare"; password: string; hash: string };

// Plain CommonJS so it runs with `eval: true`, outside the Next.js bundle; `bcryptjs` resolves
// from the project's node_modules (process.cwd()).
const WORKER_SOURCE = `
const { parentPort } = require("node:worker_threads");
const bcrypt = require("bcryptjs");
parentPort.on("message", (job) => {
  try {
    const result = job.op === "hash"
      ? bcrypt.hashSync(job.password, ${BCRYPT_ROUNDS})
      : bcrypt.compareSync(job.password, job.hash);
    parentPort.postMessage({ id: job.id, result });
  } catch (err) {
    parentPort.postMessage({ id: job.id, error: String(err && err.message || err) });
  }
});
`;

/** Threads per process; jobs go to the least busy one. */
const POOL_SIZE = Math.max(1, Number(process.env.BCRYPT_THREADS ?? 2));

interface PoolWorker {
  thread: Worker;
  jobs: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
}

let pool: PoolWorker[] | null | undefined; // null = unavailable, fall back to the calling thread
let nextId = 1;

function startWorker(): PoolWorker {
  const thread = new Worker(WORKER_SOURCE, { eval: true });
  thread.unref(); // an idle pool never keeps a process (tests, scripts) alive
  const w: PoolWorker = { thread, jobs: new Map() };
  thread.on("message", (msg: { id: number; result?: unknown; error?: string }) => {
    const job = w.jobs.get(msg.id);
    if (!job) return;
    w.jobs.delete(msg.id);
    if (w.jobs.size === 0) thread.unref();
    if (msg.error) job.reject(new Error(msg.error));
    else job.resolve(msg.result);
  });
  thread.on("error", (err) => {
    console.error("[password] bcrypt worker failed, replacing it:", err);
    for (const job of w.jobs.values()) job.reject(err);
    if (pool) pool[pool.indexOf(w)] = startWorker();
  });
  return w;
}

function getPool(): PoolWorker[] | null {
  if (pool !== undefined) return pool;
  try {
    pool = Array.from({ length: POOL_SIZE }, startWorker);
  } catch (err) {
    console.error("[password] cannot start bcrypt workers, using the request thread:", err);
    pool = null;
  }
  return pool;
}

function run<T>(job: JobInput, fallback: () => Promise<T>): Promise<T> {
  const workers = getPool();
  if (!workers) return fallback();
  const w = workers.reduce((a, b) => (b.jobs.size < a.jobs.size ? b : a));
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    w.jobs.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.thread.ref(); // stay alive while a job is in flight
    w.thread.postMessage({ ...job, id });
  });
}

export function hashPassword(password: string): Promise<string> {
  return run({ op: "hash", password }, () => bcrypt.hash(password, BCRYPT_ROUNDS));
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return run({ op: "compare", password, hash }, () => bcrypt.compare(password, hash));
}
