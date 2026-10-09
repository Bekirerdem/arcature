import { createPublicClient, defineChain, fallback, http } from "viem";
import { createConfig } from "wagmi";
import { base } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

// Reads go through our same-origin /rpc relay (Cloudflare edge) first: some networks get 503s without
// CORS headers from Arc's public RPC, which also rate-limits eth_call hard. Direct providers are fallbacks
// (and the only path in local dev, where there is no Pages Function).
const opts = { retryCount: 4, retryDelay: 500, batch: { wait: 30 } } as const;
const relay = typeof window !== "undefined" && window.location.hostname !== "localhost" ? [http("/rpc", opts)] : [];
const transport = fallback([...relay, http("https://arc-rpc.publicnode.com", opts), http("https://rpc.mainnet.arc.io", opts)]);

export const publicClient = createPublicClient({ chain: arc, transport });

const baseTransport = fallback([http("https://mainnet.base.org"), http("https://base-rpc.publicnode.com")]);
export const baseClient = createPublicClient({ chain: base, transport: baseTransport });

export const wagmiConfig = createConfig({
  chains: [arc, base],
  connectors: [injected()],
  transports: { [arc.id]: transport, [base.id]: baseTransport },
});

export const explorerTx = (hash: string) => `${arc.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (a: string) => `${arc.blockExplorers.default.url}/address/${a}`;
