# Deploy notes

- `forge script script/Deploy.s.sol --rpc-url arc --keystore ~/.orta/keystore/orta-deployer --password-file ~/.orta/pw --broadcast --slow`
- Arc explorer API sits behind a Cloudflare challenge, so `--verify` against `explorer.arc.io/api` fails from CLI. Verify through the explorer UI (Standard JSON input) instead.
- Verified live on 2026-10-09: paying an invoice **through Arc's Memo contract** works — CallFrom keeps the paying EOA as `msg.sender`, so `transferFrom(payer)` pulls the approved USDC and the Memo event lands in the same tx (`payViaMemoTx` in `deployments/arc-mainnet.json`).
