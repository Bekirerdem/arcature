// Same-origin JSON-RPC proxy for Arc mainnet (Cloudflare Pages Function).
// Some user networks (shared/VPN egress IPs) get 503 from Arc's public RPC, and those 503s carry
// no CORS headers, so the browser can't even read them. Relaying from Cloudflare's edge avoids both.

const UPSTREAMS = ["https://rpc.mainnet.arc.io"];
const ALLOWED = new Set([
  "eth_chainId", "eth_blockNumber", "eth_call", "eth_getLogs", "eth_getCode", "eth_getBalance",
  "eth_getTransactionReceipt", "eth_getTransactionByHash", "eth_getBlockByNumber", "eth_estimateGas",
  "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_getTransactionCount", "net_version",
]);

type Rpc = { method?: string };

export const onRequestPost = async ({ request }: { request: Request }): Promise<Response> => {
  const body = await request.text();
  if (body.length > 200_000) return new Response("payload too large", { status: 413 });
  let parsed: Rpc | Rpc[];
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const calls = Array.isArray(parsed) ? parsed : [parsed];
  if (calls.length > 50 || calls.some((c) => !c.method || !ALLOWED.has(c.method))) {
    return new Response("method not allowed", { status: 403 });
  }
  let last: Response | null = null;
  for (const url of UPSTREAMS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body });
      if (res.ok) {
        return new Response(res.body, { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
      }
      last = res;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  return new Response(last ? await last.text() : "upstream unavailable", { status: last?.status ?? 502 });
};
