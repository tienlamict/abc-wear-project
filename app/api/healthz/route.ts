import { checkHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

/** NF-02: for load balancers and monitoring. 200 when the DB answers, 503 otherwise. */
export async function GET(): Promise<Response> {
  const health = await checkHealth();
  return Response.json(health, {
    status: health.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
