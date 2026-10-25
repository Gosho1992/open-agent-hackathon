// Zetaris client. Uses the same route as the platform's own verify.sh:
//   POST {UI}/api/auth/login              -> JWT + orgId
//   POST {UI}/api/proxy/query/sql/start   {select, pageLimit}  (Bearer JWT, X-Org-ID)
// Credentials come from the environment, or are read from the Zetaris platform's own
// .env (ZETARIS_ADMIN_EMAIL / ZETARIS_ADMIN_PASSWORD) so nobody has to copy a secret.

import fs from "node:fs";
import crypto from "node:crypto";

const UI = (process.env.ZETARIS_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const PLATFORM_ENV = process.env.ZETARIS_PLATFORM_ENV ?? "zetaris-platform/.env";

function fromPlatformEnv(name: string): string | undefined {
  try {
    const line = fs.readFileSync(PLATFORM_ENV, "utf8").split(/\r?\n/).filter(l => l.startsWith(name + "=")).pop();
    return line?.slice(name.length + 1).replace(/^["']|["']$/g, "");
  } catch { return undefined; }
}

let session: Promise<{ token: string; org: string }> | null = null;
async function login() {
  if (process.env.ZETARIS_API_KEY) return { token: process.env.ZETARIS_API_KEY, org: process.env.ZETARIS_ORG_ID ?? "1" };
  const username = process.env.ZETARIS_ADMIN_EMAIL ?? fromPlatformEnv("ZETARIS_ADMIN_EMAIL") ?? "admin@zetaris.com";
  const password = process.env.ZETARIS_ADMIN_PASSWORD ?? fromPlatformEnv("ZETARIS_ADMIN_PASSWORD");
  if (!password) throw new Error(`Zetaris: no admin password (set ZETARIS_ADMIN_PASSWORD or ZETARIS_PLATFORM_ENV=${PLATFORM_ENV})`);
  const res = await fetch(`${UI}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
  const text = await res.text();
  const token = text.match(/[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/)?.[0];
  const org = text.match(/"orgId"\s*:\s*(\d+)/)?.[1];
  if (!res.ok || !token || !org) throw new Error(`Zetaris login failed: HTTP ${res.status}`);
  return { token, org };
}

/** Finds the first array of row objects anywhere in the response. */
function rowsOf(x: any): Record<string, any>[] | null {
  if (Array.isArray(x)) return x.length && x.every(r => r && typeof r === "object" && !Array.isArray(r)) ? x : null;
  if (x && typeof x === "object") for (const v of Object.values(x)) { const r = rowsOf(v); if (r) return r; }
  return null;
}

export interface ZResult { ok: boolean; status: number; rows: Record<string, string>[]; raw: string }

export async function zquery(sql: string, pageLimit = 5000): Promise<ZResult> {
  session ??= login();
  const { token, org } = await session;
  const res = await fetch(`${UI}/api/proxy/query/sql/start`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "x-org-id": org, "x-request-id": crypto.randomUUID() },
    body: JSON.stringify({ select: sql.trim(), pageLimit }),
    signal: AbortSignal.timeout(300_000),
  });
  const raw = await res.text();
  let body: any = null; try { body = JSON.parse(raw); } catch { /* not JSON */ }
  const failed = !res.ok || /"(error|errorMessage|exception)"\s*:\s*"[^"]/i.test(raw) || body?.status === "FAILED";
  const rows = (rowsOf(body) ?? []).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v == null ? "" : String(v)])));
  return { ok: !failed, status: res.status, rows, raw };
}
