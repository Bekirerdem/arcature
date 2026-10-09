# Keyarc

**A shared chest on Arc for teams that earn together.**

Every payment is pinned to the job that earned it. A reserve goes aside first. The rest is paid out by what each person actually delivered. Rules change only by member vote, and nobody — not the creator, not the agent, not any single member — can move money alone.

Live on **Arc mainnet** (chain 5042).

| | Address |
|---|---|
| CollectiveFactory | [`0x8e4BB9741D40C4A48EF626f2195AF99D48eb0CC2`](https://explorer.arc.io/address/0x8e4BB9741D40C4A48EF626f2195AF99D48eb0CC2) |
| Collective implementation | [`0x8af27fa90b013D2Ec01404C7BcCB882d27514061`](https://explorer.arc.io/address/0x8af27fa90b013D2Ec01404C7BcCB882d27514061) |
| Proof chest | [`0x1Bbe31a437C1B591895cBC4f3F3A25d336Ac5203`](https://explorer.arc.io/address/0x1Bbe31a437C1B591895cBC4f3F3A25d336Ac5203) |

Proof flow on mainnet: a 0.10 USDC invoice paid **through Arc's Memo contract** ([tx](https://explorer.arc.io/tx/0xbec040d84d34bbc620e1ed11206714d6b9d2d210b1acaeb5268f7e6663b104f8)) — 0.01 to reserve, 0.09 to the period pot, credited 70/30 to the two contributors, then paid out on chain at period end ([distribute tx](https://explorer.arc.io/tx/0xe6b7fe088db8af9b06c42567b4d55b0336e9054ac18f22c38ed1e5b9c7e84c1c)): 0.063 and 0.027 USDC to the members' wallets. All hashes in [`deployments/arc-mainnet.json`](deployments/arc-mainnet.json).

## The problem

Small teams that earn together — dev and design collectives, freelancer groups, agencies, producer groups — split money in one person's spreadsheet. Everyone has to trust that person, the reserve is whatever is left, and getting paid by a client abroad is slow and expensive (in Turkey there is no PayPal and no Stripe).

## How it works

1. **Open a chest** — one transaction through the factory: members, reserve share and target, payout rhythm, vote waiting time, optional agent.
2. **Pin an invoice** — who did the work and their share are fixed *before* the money arrives. The invoice id is derived from the creator, so nobody can squat it.
3. **Get paid** — the client opens a pay link, approves exactly the invoice amount and pays through Arc **Memo**, so the invoice reference lives in Arc's own memo log.
4. **Reserve first** — a share of each payment fills the reserve up to its target. The reserve leaves only by vote, to named recipients.
5. **Pay out by contribution** — at the end of the period the pot is shared pro rata to what each member brought in. A member whose transfer reverts (USDC blocklist) never blocks the others: their payout is held to claim to any address.
6. **Vote** — rules, members, agent, allowed bill recipients and reserve release need more than half of the members and a waiting time of at least an hour. Proposals expire and die when membership or rules change.
7. **Agent (optional)** — may match unlabelled income (e.g. x402 sales) to a member and pay allowed bills, within a per-period limit enforced by the contract. Anything above goes to a vote.

## Why Arc

- USDC is the gas and the unit of account: one balance, about a cent per transaction, sub-second finality.
- **Memo** ties a payment to an invoice reference natively.
- **CCTP / Gateway** let a client pay from another chain (next).
- **x402** lets AI agents buy from the team (next).

## Repo

```
contracts/   Solidity (Foundry): Collective, CollectiveFactory, 53 tests incl. accounting invariant fuzz
web/         Vite + React + TypeScript app: story landing, chests, invoices, pay page, votes
deployments/ mainnet addresses and proof transactions
docs/        design spec and implementation plans
```

### Contracts

```bash
cd contracts
forge install
forge test
```

A pre-deploy security review found no critical issues; five important findings (stale proposals, rules that allowed one-member control, per-call agent cap, invoice id squatting, reserve capture by late credit) were fixed with regression tests in `test/Hardening.t.sol`.

### Web

```bash
cd web
bun install
bun run dev        # http://localhost:5180
bun run build      # regenerates ABIs from contracts/out, type-checks, builds the PWA
```

## Roadmap

- Agent operator (matching, held payments, bills, decision log on Arc Memo)
- x402 sales channel so agents can buy from a team
- Cross-chain pay links (Base via CCTP / Gateway, Stellar via CCTP)
- TL exit through local stablecoins

## License

MIT
