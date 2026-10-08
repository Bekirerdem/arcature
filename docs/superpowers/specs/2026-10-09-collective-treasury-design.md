# Collective Treasury on Arc — Design Spec

Date: 2026-10-09 · Status: draft, awaiting review · Working name: `arc-kolektif` (final name TBD)

## 1. One sentence

A shared treasury on Arc for teams that earn money together: every incoming payment is tied to the work that produced it, a reserve is set aside first, and the rest is paid out by real contribution — rules are changed only by member vote, an agent runs the day-to-day inside limits the contract enforces.

## 2. Who and why

- **User:** a 5–20 person team that earns together but is not a formal company — dev/design collective, freelancer group, small agency, producer group.
- **Pain:** "who did how much this month, how do we split, how much stays in the till?" lives in one person's spreadsheet; everyone has to trust that person. Turkey adds: no PayPal, no Stripe, foreign clients are hard to collect from.
- **Why Arc:** USDC is the gas and the unit of account (one balance, ~$0.01/tx, sub-second finality); Memo ties a payment to a reference; CCTP/Gateway let a client pay from another chain; x402 lets agents buy from the team.

## 3. Differentiation (verified 2026-10-06/07 scans)

Arc has dozens of fixed-percentage splitters (ArcTune 70/20/10, Backr 95/5, usdc-splitter repos) and payroll apps. Closest ideas: Kuot (attribution ledger for sources), ArcSplit (usage-based split). None combines: contribution-weighted payout recomputed per period + protected reserve + member-vote rule changes + agent operator bounded by contract + multiple income channels. Lessons carried in: Coordinape died on subjective peer scoring → contribution here is only what actually turned into money; Stocksy proves patronage payouts work off-chain.

## 4. Scope by deadline

| Phase | Deadline | Ships |
|---|---|---|
| P1 Microgrant | submit 2026-10-12 (closes 10-15 06:59 TR) | Contracts on Arc **mainnet**, landing (story + motion), create-collective, pay-an-invoice page, collective dashboard, rule-change voting, one real collective with a real paid invoice and a real distribution |
| P2 Tameion | submit 2026-10-16 (closes 10-18 06:59 TR) | Agent operator, x402 sales channel, cross-chain pay (Base via CCTP/Gateway), anomaly hold flow, expense payments, decision log, real usage, <3 min video |
| Later | — | Stellar→Arc pay (Freighter), off-chain (TL) sales ledger, TRYB exit, ZK private contribution proofs |

Off-chain sale recording (former "layer C") is **out of P1/P2**: crediting money that is not in the pot would dilute members unfairly; it needs its own design.

## 5. Contracts (Solidity, Foundry)

All accounting in USDC 6 decimals via the ERC-20 interface `0x3600…0000`. Payers may send **native USDC** (18-dec `msg.value`) for one-transaction payment; the contract converts (`msg.value / 1e12`, must be exact multiple). This must be verified on Arc testnet first (native and ERC-20 balances are the same ledger per Arc docs); fallback = approve + transferFrom.

### 5.1 `CollectiveFactory`
- `create(string name, address[] members, Rules rules, address agent) → address` — deploys an EIP-1167 clone of `Collective`. Emits `CollectiveCreated`.
- Keeps a registry for the app's directory.

### 5.2 `Collective`
**State**
- `members` (set), `agent` (operator address, may be zero)
- `Rules { uint16 reserveBps; uint256 reserveTarget; uint256 autoAttributeCap; uint256 expenseCapPerPeriod; uint16 quorumBps; uint32 timelock; uint32 periodLength; }`
- `invoices[id] { amount, payer (0 = anyone), contributors[], sharesBps[], status }`
- `credit[period][member]`, `periodTotalCredit[period]`, `reserveBalance`, `unattributed`, `payeeAllowlist`

**Income**
1. `createInvoice(id, amount, payer, contributors, sharesBps)` — member or agent; shares sum to 10 000; contributors must be members. Shares are fixed **before** payment.
2. `payInvoice(id)` payable (native) or via transferFrom — on payment, `reserveBps` of the amount goes to reserve until `reserveTarget` is reached; the rest is credited to contributors by share. Emits `InvoicePaid(id, payer, amount)`.
3. Any other inflow (x402 sale, plain transfer) lands as **unattributed** (`sync()` reconciles `balanceOf` against tracked buckets).
4. `attribute(amount, member, ref)` — agent only; `amount ≤ unattributed` and `≤ autoAttributeCap`; above the cap it becomes an `Approval` request (see governance).

**Payout**
- `distribute()` — callable by agent or any member after `periodEnd`. Pays each member `distributable × credit / totalCredit` (pull-free push loop, ≤ 50 members), opens the next period. Emits `Distributed(period, total)` and per-member `Paid`.

**Expenses**
- `payExpense(to, amount, ref)` — agent only; `to` must be on `payeeAllowlist`; per-period total ≤ `expenseCapPerPeriod`; never touches `reserveBalance`. Above cap → `Approval` request.

**Governance**
- `propose(kind, payload)` → kinds: change rules, add/remove member, set agent, allowlist payee, release reserve, approve held attribution/expense.
- `vote(id)`; `execute(id)` after quorum (`quorumBps` of members) and `timelock`.
- **No single address can withdraw or change rules** — including the creator and the agent.

**Invariants (tested)**
- `balance == reserveBalance + creditedUndistributed + unattributed` (after `sync`).
- Reserve only leaves via an executed governance proposal.
- Agent can never exceed caps or pay a non-allowlisted address.
- Sum of payouts in `distribute` == distributable (dust stays for next period, never lost).

### 5.3 Arc-native touches
- **Memo** (`0x5294…e505`, EOA-only caller): the pay page sends the payment **through Memo** with `memoId = keccak256(invoiceId)` when the payer is an EOA, so the reference is in Arc's own memo log. Verify whether Memo forwards `msg.value`; if not, pay directly and emit our own event (documented honestly).
- Agent's decision log: agent EOA writes a memo with `memoId = keccak256(decisionJson)` per decision; full JSON stored off-chain (R2) for audit.

## 6. Agent operator (P2)

- Runs as a Cloudflare Worker (cron + queue), EOA key held in Worker secrets, LLM = Gemini (Bekir's primary) with structured output; deterministic code executes, model only proposes ("the model proposes, the contract disposes").
- Decisions: match unattributed inflows to invoices / x402 receipts; hold anything from an unknown payer above a threshold (opens governance approval); pay allowlisted recurring expenses within cap; pick distribution timing; propose rule changes with written reasoning (e.g. raise reserve after a weak month).
- Every decision → memo hash on Arc + JSON in R2 → visible as a timeline in the dashboard ("what the agent did and why").

## 7. Front end

- Vite + React + TypeScript strict, viem/wagmi, GSAP (ScrollTrigger) for motion, PWA (vite-plugin-pwa), hosted on Cloudflare Pages.
- **Landing:** story-driven scroll (theme + beats approved separately per DESIGN.md: theme concept → wireframe → build). Hero ≥ 60% viewport, Scatter & Settle motion tokens.
- **App surfaces:** create collective · invoice / payment-link page (public) · collective dashboard (rail + main + side column: till & reserve, this period's contribution, agent timeline, proposals) · member view ("my share this period").
- UI copy in plain Turkish + English toggle; user-facing words = Bekir's words (kasa, yedek, pay, oylama).

## 8. Testing & verification

- Foundry unit + invariant tests for every rule above; fork tests against Arc testnet for USDC/Memo behaviour.
- Testnet dry run of the full flow before mainnet; mainnet deploy from a fresh keystore wallet funded with a few USDC from Bekir's MetaMask (main key never touches tooling).
- Live verification on mainnet: real invoice paid, real distribution, links to explorer in README.

## 9. Risks

- Native-USDC `msg.value` handling and Memo value forwarding unverified → testnet spike first.
- Legal: Turkish users receiving USDC for exports is a grey area (see memory scan) → product positions as global collectives; TL exit is the user's choice.
- Time: P1 is 3 days; landing motion is the biggest time sink → contracts first, landing in parallel once theme is approved.
