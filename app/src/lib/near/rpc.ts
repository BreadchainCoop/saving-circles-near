import { NEAR_CONFIG } from "./config";

/**
 * Read-only contract view over plain JSON-RPC. No wallet and no SDK, so pages
 * can show circles before anyone signs in.
 */
export async function view<T>(
  contractId: string,
  methodName: string,
  args: object = {}
): Promise<T> {
  const res = await fetch(NEAR_CONFIG.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "view",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "optimistic",
        account_id: contractId,
        method_name: methodName,
        args_base64: toBase64(JSON.stringify(args)),
      },
    }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status} calling ${methodName}`);

  const body = await res.json();
  if (body.error) {
    throw new Error(body.error.data ?? body.error.message ?? "RPC error");
  }
  // A contract panic comes back as a successful RPC with an `error` string.
  if (body.result?.error) throw new Error(body.result.error);

  const bytes = new Uint8Array(body.result.result as number[]);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
