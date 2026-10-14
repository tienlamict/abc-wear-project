import { clearSessionCookie } from "@/lib/auth";

/** MA-02 */
export async function POST(): Promise<Response> {
  clearSessionCookie();
  return Response.json({ ok: true });
}
