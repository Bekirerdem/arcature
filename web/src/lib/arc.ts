import { createPublicClient, defineChain, http } from "viem";
import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";

export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
  blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.arc.io" } },
  contracts: { multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

// Arc's public RPC rate-limits bursts (-32005); retry with backoff instead of surfacing errors.
const transport = http("https://rpc.mainnet.arc.io", { retryCount: 6, retryDelay: 500, batch: { wait: 30 } });

export const publicClient = createPublicClient({ chain: arc, transport });

export const wagmiConfig = createConfig({
  chains: [arc],
  connectors: [injected()],
  transports: { [arc.id]: transport },
});

export const explorerTx = (hash: string) => `${arc.blockExplorers.default.url}/tx/${hash}`;
export const explorerAddress = (a: string) => `${arc.blockExplorers.default.url}/address/${a}`;
