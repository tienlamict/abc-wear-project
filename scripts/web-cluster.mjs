// Production web server on every core: one Next.js request handler per process, all sharing
// one port through node:cluster. Works because the web tier keeps no state in memory (NF-02):
// sessions are JWT cookies, carts and lockouts live in MySQL.
//
//   pnpm build && pnpm start:cluster     (WEB_WORKERS=4 PORT=3000 by default)
import cluster from "node:cluster";
import http from "node:http";
import { availableParallelism } from "node:os";
import next from "next";

const port = Number(process.env.PORT ?? 3000);
const workers = Number(process.env.WEB_WORKERS ?? Math.min(4, availableParallelism()));

if (cluster.isPrimary) {
  // Round-robin connections. Node's default on Windows lets the OS pick, which piles most
  // keep-alive connections onto one worker (measured: 4× the CPU of another under k6).
  cluster.schedulingPolicy = cluster.SCHED_RR;
  console.log(`[web] starting ${workers} worker process(es) on http://localhost:${port}`);
  for (let i = 0; i < workers; i++) cluster.fork();

  let stopping = false;
  cluster.on("exit", (worker, code, signal) => {
    if (stopping) return;
    console.error(
      `[web] worker ${worker.process.pid} exited (${signal ?? code}), starting another`,
    );
    cluster.fork();
  });
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      stopping = true;
      for (const w of Object.values(cluster.workers ?? {})) w?.kill(sig);
      process.exit(0);
    });
  }
} else {
  const app = next({ dev: false, hostname: "localhost", port });
  const handle = app.getRequestHandler();
  await app.prepare();
  http
    .createServer((req, res) => handle(req, res))
    .listen(port, () => {
      console.log(`[web] worker ${process.pid} ready`);
    });
}
