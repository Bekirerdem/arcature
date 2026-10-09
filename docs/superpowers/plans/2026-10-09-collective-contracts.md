# Collective Treasury Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `Collective` + `CollectiveFactory` contracts to Arc mainnet with full Foundry tests, then prove the flow with one real paid invoice and one real distribution.

**Architecture:** One `Collective` implementation, cloned per team via EIP-1167 by `CollectiveFactory`. All money is USDC through the ERC-20 interface (6 decimals). Income enters through paid invoices (contribution shares fixed before payment) or as unattributed inflow the agent may attribute within a cap; a reserve cut is taken first; the period's pool is paid out pro-rata to credit; anything above agent caps and every rule change goes through member proposals with quorum + timelock.

**Tech Stack:** Solidity ^0.8.28, Foundry 1.7 (forge/cast), OpenZeppelin Contracts v5 (Clones, Initializable, ReentrancyGuard, SafeERC20, ERC20 for mocks).

**Spec:** `docs/superpowers/specs/2026-10-09-collective-treasury-design.md`

**Scope of this plan:** on-chain part of Phase 1 only. Front end (landing + app) gets its own plan after the theme is chosen; the agent (Phase 2) gets its own plan.

## Global Constraints

- Arc mainnet: chain 5042, RPC `https://rpc.mainnet.arc.io`, explorer `https://explorer.arc.io` (Blockscout).
- USDC ERC-20 interface: `0x3600000000000000000000000000000000000000`, 6 decimals. Never read `msg.value` / native balance in accounting (18 vs 6 decimals).
- Memo: `0x5294E9927c3306DcBaDb03fe70b92e01cCede505`, `memo(address target, bytes data, bytes32 memoId, bytes memoData)`, not payable, EOA caller only, preserves `msg.sender` for the target.
- `evm_version = "prague"` (Arc is Osaka-based; prague opcodes are a safe subset). No `PREVRANDAO` use.
- Max 50 members per collective; max 20 contributors per invoice; basis points = 10 000.
- No single address (creator, agent, member) can withdraw funds or change rules alone.
- Commit messages in English, conventional, no Co-Authored-By trailer; few, large commits (one per task group).
- Deployer key: fresh encrypted keystore at `~/.orta/keystore/`, never Bekir's MetaMask key; password file outside the repo.

## Review Focus

1. A member whose USDC transfer reverts (blocklisted) must not block everyone else's payout → payout deferred to `owed`, claimable to another address. Test in Task 5.
2. An invoice paid twice, by the wrong payer, or after cancellation must revert and move no money. Test in Task 2.
3. The agent attributing more than the unattributed balance, above its cap, to a non-member, paying a non-allowlisted payee, or exceeding the period expense cap must revert. Tests in Tasks 3–4.
4. A member removed mid-period keeps the credit they already earned and is paid at distribution. Test in Task 6.
5. Rounding dust is never lost: `balance == reserve + pool + totalOwed + unattributed` holds after every action. Fuzz invariant in Task 7.

---

### Task 1: Foundry scaffold, shared types, USDC mocks

**Files:**
- Create: `contracts/foundry.toml`, `contracts/src/CollectiveTypes.sol`, `contracts/test/mocks/MockUSDC.sol`, `contracts/test/mocks/BlocklistUSDC.sol`, `contracts/.gitignore`

**Interfaces:**
- Produces: `struct Rules { uint16 reserveBps; uint256 reserveTarget; uint256 autoAttributeCap; uint256 expenseCapPerPeriod; uint16 quorumBps; uint32 timelock; uint32 periodLength; }`; `MockUSDC(6 decimals, mint(address,uint256))`; `BlocklistUSDC is MockUSDC` with `block(address)`.

- [ ] **Step 1: Init project and dependency**

```bash
cd contracts && forge init --no-git --no-commit . --force && rm -f src/Counter.sol test/Counter.t.sol script/Counter.s.sol
forge install OpenZeppelin/openzeppelin-contracts@v5.4.0 --no-git
```

- [ ] **Step 2: Config**

`contracts/foundry.toml`
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.28"
evm_version = "prague"
optimizer = true
optimizer_runs = 200
remappings = ["@openzeppelin/=lib/openzeppelin-contracts/"]

[fuzz]
runs = 512

[invariant]
runs = 128
depth = 64

[rpc_endpoints]
arc = "https://rpc.mainnet.arc.io"

[etherscan]
arc = { key = "blockscout", url = "https://explorer.arc.io/api", chain = 5042 }
```

`contracts/.gitignore`
```
out/
cache/
broadcast/*/31337/
.env
```

- [ ] **Step 3: Types and mocks**

`contracts/src/CollectiveTypes.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Rules a collective runs by. Changed only through an executed proposal.
struct Rules {
    uint16 reserveBps;           // share of every income moved to reserve while reserve < reserveTarget
    uint256 reserveTarget;       // USDC (6 dec) the reserve fills up to
    uint256 autoAttributeCap;    // max USDC the agent may attribute in one call without a vote
    uint256 expenseCapPerPeriod; // max USDC the agent may spend per period without a vote
    uint16 quorumBps;            // share of members whose votes execute a proposal
    uint32 timelock;             // seconds between proposal creation and execution
    uint32 periodLength;         // seconds per payout period
}
```

`contracts/test/mocks/MockUSDC.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
```

`contracts/test/mocks/BlocklistUSDC.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MockUSDC} from "./MockUSDC.sol";

/// @dev Mimics USDC's blocklist: transfers to a blocked address revert.
contract BlocklistUSDC is MockUSDC {
    mapping(address => bool) public blocked;
    error Blocked(address account);
    function setBlocked(address account, bool value) external { blocked[account] = value; }
    function _update(address from, address to, uint256 value) internal override {
        if (blocked[to] || blocked[from]) revert Blocked(blocked[to] ? to : from);
        super._update(from, to, value);
    }
}
```

- [ ] **Step 4: Build**

Run: `cd contracts && forge build`
Expected: `Compiler run successful`

(Commit together with Task 2.)

---

### Task 2: Collective core — init, members, invoices, reserve cut, credit

**Files:**
- Create: `contracts/src/Collective.sol`, `contracts/test/CollectiveBase.t.sol`, `contracts/test/Invoices.t.sol`

**Interfaces:**
- Consumes: `Rules`, `MockUSDC`.
- Produces (used by every later task and by the front end):
  - `initialize(IERC20 usdc, string name, address[] members, Rules rules, address agent)`
  - `createInvoice(bytes32 id, uint256 amount, address payer, address[] contributors, uint16[] sharesBps)`
  - `payInvoice(bytes32 id)`, `cancelInvoice(bytes32 id)`
  - views: `invoice(bytes32) returns (uint256 amount, address payer, uint8 status, address[] contributors, uint16[] sharesBps)`, `members() returns (address[])`, `rules() returns (Rules)`, `reserve()`, `pool()`, `period()`, `periodStart()`, `credit(uint256 period, address member)`, `totalCredit(uint256 period)`, `creditors(uint256 period) returns (address[])`, `unattributed()`, `totalOwed()`
  - events: `InvoiceCreated(bytes32 indexed id, uint256 amount, address payer)`, `InvoicePaid(bytes32 indexed id, address indexed payer, uint256 amount, uint256 toReserve)`, `InvoiceCancelled(bytes32 indexed id)`, `Credited(uint256 indexed period, address indexed member, uint256 amount)`

- [ ] **Step 1: Shared test base**

`contracts/test/CollectiveBase.t.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Collective} from "../src/Collective.sol";
import {Rules} from "../src/CollectiveTypes.sol";
import {BlocklistUSDC} from "./mocks/BlocklistUSDC.sol";

abstract contract CollectiveBase is Test {
    BlocklistUSDC usdc;
    Collective c;
    address ali = makeAddr("ali");
    address ayse = makeAddr("ayse");
    address mehmet = makeAddr("mehmet");
    address agent = makeAddr("agent");
    address client = makeAddr("client");
    uint256 constant USDC = 1e6;

    function defaultRules() internal pure returns (Rules memory) {
        return Rules({
            reserveBps: 1000,           // 10%
            reserveTarget: 500 * USDC,
            autoAttributeCap: 100 * USDC,
            expenseCapPerPeriod: 200 * USDC,
            quorumBps: 5001,            // majority
            timelock: 1 days,
            periodLength: 30 days
        });
    }

    function setUp() public virtual {
        usdc = new BlocklistUSDC();
        c = Collective(Clones.clone(address(new Collective())));
        address[] memory m = new address[](3);
        m[0] = ali; m[1] = ayse; m[2] = mehmet;
        c.initialize(IERC20(address(usdc)), "Test Guild", m, defaultRules(), agent);
        usdc.mint(client, 100_000 * USDC);
        vm.prank(client);
        usdc.approve(address(c), type(uint256).max);
    }

    function _invoice(bytes32 id, uint256 amount, address a, uint16 sa, address b, uint16 sb) internal {
        address[] memory who = new address[](2);
        uint16[] memory sh = new uint16[](2);
        who[0] = a; who[1] = b; sh[0] = sa; sh[1] = sb;
        vm.prank(ali);
        c.createInvoice(id, amount, address(0), who, sh);
    }

    function _accounted() internal view returns (uint256) {
        return c.reserve() + c.pool() + c.totalOwed() + c.unattributed();
    }
}
```

- [ ] **Step 2: Failing tests for invoices**

`contracts/test/Invoices.t.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CollectiveBase} from "./CollectiveBase.t.sol";
import {Collective} from "../src/Collective.sol";

contract InvoicesTest is CollectiveBase {
    bytes32 constant INV = keccak256("site-v2/milestone-2");

    function test_payInvoice_takesReserveAndCreditsByShare() public {
        _invoice(INV, 2000 * USDC, ali, 6000, ayse, 4000);
        vm.prank(client);
        c.payInvoice(INV);

        assertEq(c.reserve(), 200 * USDC);          // 10% of 2000
        assertEq(c.pool(), 1800 * USDC);
        assertEq(c.credit(0, ali), 1200 * USDC);    // credit = gross x share
        assertEq(c.credit(0, ayse), 800 * USDC);
        assertEq(c.totalCredit(0), 2000 * USDC);
        assertEq(usdc.balanceOf(address(c)), _accounted());
    }

    function test_reserveStopsAtTarget() public {
        _invoice(INV, 10_000 * USDC, ali, 5000, ayse, 5000);
        vm.prank(client);
        c.payInvoice(INV);
        assertEq(c.reserve(), 500 * USDC);          // capped by reserveTarget
        assertEq(c.pool(), 9500 * USDC);
    }

    function test_cannotPayTwice() public {
        _invoice(INV, 10 * USDC, ali, 5000, ayse, 5000);
        vm.startPrank(client);
        c.payInvoice(INV);
        vm.expectRevert(Collective.InvoiceNotOpen.selector);
        c.payInvoice(INV);
        vm.stopPrank();
    }

    function test_wrongPayerReverts() public {
        address[] memory who = new address[](1);
        uint16[] memory sh = new uint16[](1);
        who[0] = ali; sh[0] = 10_000;
        vm.prank(ali);
        c.createInvoice(INV, 10 * USDC, client, who, sh);
        address stranger = makeAddr("stranger");
        usdc.mint(stranger, 10 * USDC);
        vm.startPrank(stranger);
        usdc.approve(address(c), type(uint256).max);
        vm.expectRevert(Collective.WrongPayer.selector);
        c.payInvoice(INV);
        vm.stopPrank();
    }

    function test_cancelledInvoiceCannotBePaid() public {
        _invoice(INV, 10 * USDC, ali, 5000, ayse, 5000);
        vm.prank(agent);
        c.cancelInvoice(INV);
        vm.prank(client);
        vm.expectRevert(Collective.InvoiceNotOpen.selector);
        c.payInvoice(INV);
    }

    function test_sharesMustSumTo10000() public {
        address[] memory who = new address[](2);
        uint16[] memory sh = new uint16[](2);
        who[0] = ali; who[1] = ayse; sh[0] = 5000; sh[1] = 4000;
        vm.prank(ali);
        vm.expectRevert(Collective.BadShares.selector);
        c.createInvoice(INV, 10 * USDC, address(0), who, sh);
    }

    function test_contributorMustBeMember() public {
        address[] memory who = new address[](1);
        uint16[] memory sh = new uint16[](1);
        who[0] = client; sh[0] = 10_000;
        vm.prank(ali);
        vm.expectRevert(abi.encodeWithSelector(Collective.NotAMember.selector, client));
        c.createInvoice(INV, 10 * USDC, address(0), who, sh);
    }

    function test_strangerCannotCreateInvoice() public {
        address[] memory who = new address[](1);
        uint16[] memory sh = new uint16[](1);
        who[0] = ali; sh[0] = 10_000;
        vm.prank(client);
        vm.expectRevert(Collective.NotMemberOrAgent.selector);
        c.createInvoice(INV, 10 * USDC, address(0), who, sh);
    }

    function test_cannotInitializeTwice() public {
        address[] memory m = new address[](1);
        m[0] = ali;
        vm.expectRevert();
        c.initialize(IERC20(address(usdc)), "x", m, defaultRules(), agent);
    }
}
```

- [ ] **Step 3: Run to see failure**

Run: `cd contracts && forge test --match-contract InvoicesTest`
Expected: compile error, `Collective.sol` not found.

- [ ] **Step 4: Implement `Collective.sol` (full contract; later tasks only add tests)**

`contracts/src/Collective.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Rules} from "./CollectiveTypes.sol";

/// @title Collective
/// @notice Shared treasury for a team that earns together. Income is tied to the work that
///         produced it, a reserve is set aside first, the rest is paid out by contribution.
///         Nobody (creator, agent or any single member) can move funds or change rules alone.
contract Collective is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MAX_MEMBERS = 50;
    uint256 public constant MAX_CONTRIBUTORS = 20;
    uint16 internal constant BPS = 10_000;

    enum InvoiceStatus { None, Open, Paid, Cancelled }
    enum Kind { SetRules, AddMember, RemoveMember, SetAgent, SetPayee, ReleaseReserve, Attribute, Expense }

    struct Invoice {
        uint256 amount;
        address payer;
        InvoiceStatus status;
        address[] contributors;
        uint16[] sharesBps;
    }

    struct Proposal {
        Kind kind;
        bytes payload;
        bytes32 ref;
        address proposer;
        uint64 createdAt;
        uint32 votes;
        bool executed;
    }

    IERC20 public usdc;
    string public name;
    address public agent;
    Rules internal _rules;
    address[] internal _members;
    mapping(address => bool) public isMember;
    mapping(address => bool) public isPayee;

    uint256 public reserve;
    uint256 public pool;
    uint256 public totalOwed;
    mapping(address => uint256) public owed;

    uint256 public period;
    uint64 public periodStart;
    uint256 public expensesThisPeriod;
    mapping(uint256 => mapping(address => uint256)) public credit;
    mapping(uint256 => uint256) public totalCredit;
    mapping(uint256 => address[]) internal _creditors;

    mapping(bytes32 => Invoice) internal _invoices;
    Proposal[] internal _proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event Initialized(string name, address[] members, address agent);
    event InvoiceCreated(bytes32 indexed id, uint256 amount, address payer);
    event InvoicePaid(bytes32 indexed id, address indexed payer, uint256 amount, uint256 toReserve);
    event InvoiceCancelled(bytes32 indexed id);
    event Credited(uint256 indexed period, address indexed member, uint256 amount);
    event Attributed(address indexed member, uint256 amount, bytes32 ref);
    event ExpensePaid(address indexed to, uint256 amount, bytes32 ref);
    event Paid(uint256 indexed period, address indexed member, uint256 amount);
    event PayoutDeferred(uint256 indexed period, address indexed member, uint256 amount);
    event Claimed(address indexed member, address to, uint256 amount);
    event Distributed(uint256 indexed period, uint256 total, uint256 carried);
    event Proposed(uint256 indexed id, Kind kind, address indexed proposer, bytes32 ref);
    event Voted(uint256 indexed id, address indexed member);
    event Executed(uint256 indexed id, Kind kind);

    error NotAMember(address account);
    error NotMemberOrAgent();
    error NotAgent();
    error BadRules();
    error BadMembers();
    error BadShares();
    error InvoiceExists();
    error InvoiceNotOpen();
    error WrongPayer();
    error ZeroAmount();
    error ExceedsUnattributed();
    error AboveCap();
    error NotPayee(address to);
    error InsufficientPool();
    error InsufficientReserve();
    error PeriodNotOver();
    error AgentCannotPropose(Kind kind);
    error AlreadyVoted();
    error AlreadyExecuted();
    error NoQuorum();
    error TimelockActive();
    error UnknownProposal();

    modifier onlyMember() {
        if (!isMember[msg.sender]) revert NotAMember(msg.sender);
        _;
    }

    modifier onlyMemberOrAgent() {
        if (!isMember[msg.sender] && (msg.sender != agent || agent == address(0))) revert NotMemberOrAgent();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent || agent == address(0)) revert NotAgent();
        _;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(
        IERC20 usdc_,
        string calldata name_,
        address[] calldata members_,
        Rules calldata rules_,
        address agent_
    ) external initializer {
        if (members_.length == 0 || members_.length > MAX_MEMBERS) revert BadMembers();
        _validateRules(rules_);
        usdc = usdc_;
        name = name_;
        agent = agent_;
        _rules = rules_;
        for (uint256 i; i < members_.length; ++i) {
            address m = members_[i];
            if (m == address(0) || isMember[m]) revert BadMembers();
            isMember[m] = true;
            _members.push(m);
        }
        periodStart = uint64(block.timestamp);
        emit Initialized(name_, members_, agent_);
    }

    // ───────────────────────────── income ─────────────────────────────

    function createInvoice(
        bytes32 id,
        uint256 amount,
        address payer,
        address[] calldata contributors,
        uint16[] calldata sharesBps
    ) external onlyMemberOrAgent {
        if (_invoices[id].status != InvoiceStatus.None) revert InvoiceExists();
        if (amount == 0) revert ZeroAmount();
        uint256 n = contributors.length;
        if (n == 0 || n > MAX_CONTRIBUTORS || n != sharesBps.length) revert BadShares();
        uint256 sum;
        for (uint256 i; i < n; ++i) {
            if (!isMember[contributors[i]]) revert NotAMember(contributors[i]);
            sum += sharesBps[i];
        }
        if (sum != BPS) revert BadShares();
        Invoice storage inv = _invoices[id];
        inv.amount = amount;
        inv.payer = payer;
        inv.status = InvoiceStatus.Open;
        inv.contributors = contributors;
        inv.sharesBps = sharesBps;
        emit InvoiceCreated(id, amount, payer);
    }

    function cancelInvoice(bytes32 id) external onlyMemberOrAgent {
        Invoice storage inv = _invoices[id];
        if (inv.status != InvoiceStatus.Open) revert InvoiceNotOpen();
        inv.status = InvoiceStatus.Cancelled;
        emit InvoiceCancelled(id);
    }

    /// @notice Pay an open invoice. Works when called directly or through Arc's Memo contract,
    ///         which preserves the paying EOA as msg.sender.
    function payInvoice(bytes32 id) external nonReentrant {
        Invoice storage inv = _invoices[id];
        if (inv.status != InvoiceStatus.Open) revert InvoiceNotOpen();
        if (inv.payer != address(0) && inv.payer != msg.sender) revert WrongPayer();
        inv.status = InvoiceStatus.Paid;
        uint256 amount = inv.amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 toReserve = _takeReserve(amount);
        pool += amount - toReserve;
        uint256 n = inv.contributors.length;
        for (uint256 i; i < n; ++i) {
            _addCredit(inv.contributors[i], (amount * inv.sharesBps[i]) / BPS);
        }
        emit InvoicePaid(id, msg.sender, amount, toReserve);
    }

    /// @notice Agent ties unattributed inflow (x402 sale, plain transfer) to a member, within its cap.
    function attribute(address member, uint256 amount, bytes32 ref) external onlyAgent nonReentrant {
        if (amount > _rules.autoAttributeCap) revert AboveCap();
        _attribute(member, amount, ref);
    }

    // ───────────────────────────── spending ─────────────────────────────

    function payExpense(address to, uint256 amount, bytes32 ref) external onlyAgent nonReentrant {
        if (!isPayee[to]) revert NotPayee(to);
        if (expensesThisPeriod + amount > _rules.expenseCapPerPeriod) revert AboveCap();
        expensesThisPeriod += amount;
        _spend(to, amount, ref);
    }

    // ───────────────────────────── payout ─────────────────────────────

    function distribute() external onlyMemberOrAgent nonReentrant {
        if (block.timestamp < uint256(periodStart) + _rules.periodLength) revert PeriodNotOver();
        uint256 p = period;
        uint256 total = totalCredit[p];
        uint256 pot = pool;
        uint256 paid;
        if (total > 0 && pot > 0) {
            address[] storage cs = _creditors[p];
            uint256 n = cs.length;
            for (uint256 i; i < n; ++i) {
                address m = cs[i];
                uint256 share = (pot * credit[p][m]) / total;
                if (share == 0) continue;
                paid += share;
                _payOut(p, m, share);
            }
            pool = pot - paid;
        }
        period = p + 1;
        periodStart = uint64(block.timestamp);
        expensesThisPeriod = 0;
        emit Distributed(p, paid, pool);
    }

    /// @notice Collect a payout that could not be pushed (e.g. recipient blocklisted). May go to another address.
    function claim(address to) external nonReentrant {
        uint256 amount = owed[msg.sender];
        if (amount == 0) revert ZeroAmount();
        owed[msg.sender] = 0;
        totalOwed -= amount;
        usdc.safeTransfer(to, amount);
        emit Claimed(msg.sender, to, amount);
    }

    // ───────────────────────────── governance ─────────────────────────────

    function propose(Kind kind, bytes calldata payload, bytes32 ref) external returns (uint256 id) {
        bool member = isMember[msg.sender];
        if (!member) {
            if (msg.sender != agent || agent == address(0)) revert NotMemberOrAgent();
            if (kind != Kind.Attribute && kind != Kind.Expense) revert AgentCannotPropose(kind);
        }
        id = _proposals.length;
        _proposals.push(Proposal({
            kind: kind, payload: payload, ref: ref, proposer: msg.sender,
            createdAt: uint64(block.timestamp), votes: 0, executed: false
        }));
        emit Proposed(id, kind, msg.sender, ref);
        if (member) _vote(id);
    }

    function vote(uint256 id) external onlyMember {
        if (id >= _proposals.length) revert UnknownProposal();
        _vote(id);
    }

    function execute(uint256 id) external onlyMemberOrAgent nonReentrant {
        if (id >= _proposals.length) revert UnknownProposal();
        Proposal storage pr = _proposals[id];
        if (pr.executed) revert AlreadyExecuted();
        if (block.timestamp < uint256(pr.createdAt) + _rules.timelock) revert TimelockActive();
        if (uint256(pr.votes) * BPS < uint256(_rules.quorumBps) * _members.length) revert NoQuorum();
        pr.executed = true;
        _apply(pr.kind, pr.payload, pr.ref);
        emit Executed(id, pr.kind);
    }

    // ───────────────────────────── views ─────────────────────────────

    function rules() external view returns (Rules memory) { return _rules; }
    function members() external view returns (address[] memory) { return _members; }
    function creditors(uint256 p) external view returns (address[] memory) { return _creditors[p]; }
    function proposalCount() external view returns (uint256) { return _proposals.length; }
    function proposal(uint256 id) external view returns (Proposal memory) { return _proposals[id]; }

    function invoice(bytes32 id) external view returns (
        uint256 amount, address payer, InvoiceStatus status, address[] memory contributors, uint16[] memory sharesBps
    ) {
        Invoice storage inv = _invoices[id];
        return (inv.amount, inv.payer, inv.status, inv.contributors, inv.sharesBps);
    }

    /// @notice USDC held but not yet tied to anyone (x402 sales, plain transfers).
    function unattributed() public view returns (uint256) {
        uint256 bal = usdc.balanceOf(address(this));
        uint256 tracked = reserve + pool + totalOwed;
        return bal > tracked ? bal - tracked : 0;
    }

    // ───────────────────────────── internals ─────────────────────────────

    function _takeReserve(uint256 amount) internal returns (uint256 toReserve) {
        uint256 target = _rules.reserveTarget;
        if (reserve >= target) return 0;
        toReserve = (amount * _rules.reserveBps) / BPS;
        uint256 room = target - reserve;
        if (toReserve > room) toReserve = room;
        reserve += toReserve;
    }

    function _addCredit(address member, uint256 amount) internal {
        if (amount == 0) return;
        uint256 p = period;
        if (credit[p][member] == 0) _creditors[p].push(member);
        credit[p][member] += amount;
        totalCredit[p] += amount;
        emit Credited(p, member, amount);
    }

    function _attribute(address member, uint256 amount, bytes32 ref) internal {
        if (amount == 0) revert ZeroAmount();
        if (!isMember[member]) revert NotAMember(member);
        if (amount > unattributed()) revert ExceedsUnattributed();
        uint256 toReserve = _takeReserve(amount);
        pool += amount - toReserve;
        _addCredit(member, amount);
        emit Attributed(member, amount, ref);
    }

    function _spend(address to, uint256 amount, bytes32 ref) internal {
        if (amount == 0) revert ZeroAmount();
        if (amount > pool) revert InsufficientPool();
        pool -= amount;
        usdc.safeTransfer(to, amount);
        emit ExpensePaid(to, amount, ref);
    }

    function _payOut(uint256 p, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = address(usdc).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        if (ok && (ret.length == 0 || abi.decode(ret, (bool)))) {
            emit Paid(p, to, amount);
        } else {
            owed[to] += amount;
            totalOwed += amount;
            emit PayoutDeferred(p, to, amount);
        }
    }

    function _vote(uint256 id) internal {
        Proposal storage pr = _proposals[id];
        if (pr.executed) revert AlreadyExecuted();
        if (hasVoted[id][msg.sender]) revert AlreadyVoted();
        hasVoted[id][msg.sender] = true;
        pr.votes += 1;
        emit Voted(id, msg.sender);
    }

    function _apply(Kind kind, bytes memory payload, bytes32 ref) internal {
        if (kind == Kind.SetRules) {
            Rules memory r = abi.decode(payload, (Rules));
            _validateRules(r);
            _rules = r;
        } else if (kind == Kind.AddMember) {
            address m = abi.decode(payload, (address));
            if (m == address(0) || isMember[m] || _members.length >= MAX_MEMBERS) revert BadMembers();
            isMember[m] = true;
            _members.push(m);
        } else if (kind == Kind.RemoveMember) {
            address m = abi.decode(payload, (address));
            if (!isMember[m] || _members.length == 1) revert BadMembers();
            isMember[m] = false;
            uint256 n = _members.length;
            for (uint256 i; i < n; ++i) {
                if (_members[i] == m) {
                    _members[i] = _members[n - 1];
                    _members.pop();
                    break;
                }
            }
        } else if (kind == Kind.SetAgent) {
            agent = abi.decode(payload, (address));
        } else if (kind == Kind.SetPayee) {
            (address to, bool allowed) = abi.decode(payload, (address, bool));
            isPayee[to] = allowed;
        } else if (kind == Kind.ReleaseReserve) {
            uint256 amount = abi.decode(payload, (uint256));
            if (amount > reserve) revert InsufficientReserve();
            reserve -= amount;
            pool += amount;
        } else if (kind == Kind.Attribute) {
            (address member, uint256 amount) = abi.decode(payload, (address, uint256));
            _attribute(member, amount, ref);
        } else if (kind == Kind.Expense) {
            (address to, uint256 amount) = abi.decode(payload, (address, uint256));
            _spend(to, amount, ref);
        }
    }

    function _validateRules(Rules memory r) internal pure {
        if (r.reserveBps > BPS || r.quorumBps == 0 || r.quorumBps > BPS || r.periodLength == 0) revert BadRules();
    }
}
```

Note: a member removed mid-period keeps `credit[period][m]` and stays in `_creditors[period]`, so `distribute` still pays them (Review Focus 4).

- [ ] **Step 5: Run tests**

Run: `cd contracts && forge test --match-contract InvoicesTest -vv`
Expected: 8 tests PASS.

- [ ] **Step 6: Commit (Tasks 1–2)**

```bash
git add contracts && git commit -m "feat(contracts): collective treasury core with invoices, reserve and credit"
```

---

### Task 3: Unattributed inflow and agent attribution

**Files:**
- Create: `contracts/test/Attribution.t.sol`

**Interfaces:**
- Consumes: `attribute(address,uint256,bytes32)`, `unattributed()`, `propose(Kind,bytes,bytes32)`, `Collective.Kind.Attribute`.

- [ ] **Step 1: Tests**

`contracts/test/Attribution.t.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CollectiveBase} from "./CollectiveBase.t.sol";
import {Collective} from "../src/Collective.sol";

contract AttributionTest is CollectiveBase {
    function _x402Sale(uint256 amount) internal {
        vm.prank(client);
        usdc.transfer(address(c), amount); // a plain transfer, like an x402 settlement
    }

    function test_plainTransferShowsAsUnattributed() public {
        _x402Sale(30 * USDC);
        assertEq(c.unattributed(), 30 * USDC);
        assertEq(c.pool(), 0);
    }

    function test_agentAttributesWithinCap() public {
        _x402Sale(30 * USDC);
        vm.prank(agent);
        c.attribute(mehmet, 30 * USDC, keccak256("template-sale-17"));
        assertEq(c.unattributed(), 0);
        assertEq(c.credit(0, mehmet), 30 * USDC);
        assertEq(c.reserve() + c.pool(), 30 * USDC);
        assertEq(usdc.balanceOf(address(c)), _accounted());
    }

    function test_agentCannotAttributeMoreThanUnattributed() public {
        _x402Sale(10 * USDC);
        vm.prank(agent);
        vm.expectRevert(Collective.ExceedsUnattributed.selector);
        c.attribute(mehmet, 11 * USDC, bytes32(0));
    }

    function test_agentCannotAttributeAboveCap() public {
        _x402Sale(150 * USDC);
        vm.prank(agent);
        vm.expectRevert(Collective.AboveCap.selector);
        c.attribute(mehmet, 150 * USDC, bytes32(0));
    }

    function test_agentCannotAttributeToNonMember() public {
        _x402Sale(10 * USDC);
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Collective.NotAMember.selector, client));
        c.attribute(client, 10 * USDC, bytes32(0));
    }

    function test_memberCannotUseAgentPath() public {
        _x402Sale(10 * USDC);
        vm.prank(ali);
        vm.expectRevert(Collective.NotAgent.selector);
        c.attribute(ali, 10 * USDC, bytes32(0));
    }

    function test_aboveCapGoesThroughVote() public {
        _x402Sale(150 * USDC);
        vm.prank(agent);
        uint256 id = c.propose(Collective.Kind.Attribute, abi.encode(mehmet, 150 * USDC), keccak256("big-sale"));
        vm.prank(ali);
        c.vote(id);
        vm.prank(ayse);
        c.vote(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(agent);
        c.execute(id);
        assertEq(c.credit(0, mehmet), 150 * USDC);
    }

    function test_agentCannotProposeRuleChange() public {
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Collective.AgentCannotPropose.selector, Collective.Kind.SetRules));
        c.propose(Collective.Kind.SetRules, abi.encode(defaultRules()), bytes32(0));
    }
}
```

- [ ] **Step 2: Run**

Run: `cd contracts && forge test --match-contract AttributionTest -vv`
Expected: 8 tests PASS (implementation already in Task 2; any failure is a bug in `Collective.sol` — fix there).

---

### Task 4: Expenses

**Files:**
- Create: `contracts/test/Expenses.t.sol`

- [ ] **Step 1: Tests**

`contracts/test/Expenses.t.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CollectiveBase} from "./CollectiveBase.t.sol";
import {Collective} from "../src/Collective.sol";

contract ExpensesTest is CollectiveBase {
    address hosting = makeAddr("hosting");

    function setUp() public override {
        super.setUp();
        _invoice(keccak256("job"), 1000 * USDC, ali, 5000, ayse, 5000);
        vm.prank(client);
        c.payInvoice(keccak256("job")); // reserve 100, pool 900
        _allowPayee(hosting);
    }

    function _allowPayee(address who) internal {
        vm.prank(ali);
        uint256 id = c.propose(Collective.Kind.SetPayee, abi.encode(who, true), bytes32(0));
        vm.prank(ayse);
        c.vote(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(ali);
        c.execute(id);
    }

    function test_agentPaysAllowlistedExpense() public {
        vm.prank(agent);
        c.payExpense(hosting, 50 * USDC, keccak256("vps-oct"));
        assertEq(usdc.balanceOf(hosting), 50 * USDC);
        assertEq(c.pool(), 850 * USDC);
        assertEq(c.reserve(), 100 * USDC); // reserve untouched
    }

    function test_nonAllowlistedPayeeReverts() public {
        address rando = makeAddr("rando");
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(Collective.NotPayee.selector, rando));
        c.payExpense(rando, 1 * USDC, bytes32(0));
    }

    function test_periodCapEnforced() public {
        vm.startPrank(agent);
        c.payExpense(hosting, 150 * USDC, bytes32(0));
        vm.expectRevert(Collective.AboveCap.selector);
        c.payExpense(hosting, 51 * USDC, bytes32(0));
        vm.stopPrank();
    }

    function test_expenseCannotTouchReserve() public {
        _allowPayee(hosting);
        vm.prank(ali);
        uint256 id = c.propose(Collective.Kind.Expense, abi.encode(hosting, 950 * USDC), bytes32(0));
        vm.prank(ayse);
        c.vote(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(ali);
        vm.expectRevert(Collective.InsufficientPool.selector);
        c.execute(id);
    }

    function test_capResetsNextPeriod() public {
        vm.prank(agent);
        c.payExpense(hosting, 200 * USDC, bytes32(0));
        vm.warp(block.timestamp + 30 days);
        vm.prank(ali);
        c.distribute();
        // pool was distributed; fund again
        _invoice(keccak256("job2"), 1000 * USDC, ali, 5000, ayse, 5000);
        vm.prank(client);
        c.payInvoice(keccak256("job2"));
        vm.prank(agent);
        c.payExpense(hosting, 200 * USDC, bytes32(0));
        assertEq(c.expensesThisPeriod(), 200 * USDC);
    }
}
```

- [ ] **Step 2: Run**

Run: `cd contracts && forge test --match-contract ExpensesTest -vv`
Expected: 5 tests PASS.

---

### Task 5: Distribution, deferred payouts, claim

**Files:**
- Create: `contracts/test/Distribution.t.sol`

- [ ] **Step 1: Tests**

`contracts/test/Distribution.t.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CollectiveBase} from "./CollectiveBase.t.sol";
import {Collective} from "../src/Collective.sol";

contract DistributionTest is CollectiveBase {
    function setUp() public override {
        super.setUp();
        _invoice(keccak256("a"), 2000 * USDC, ali, 6000, ayse, 4000);   // ali 1200, ayse 800 credit
        vm.prank(client);
        c.payInvoice(keccak256("a"));
        _invoice(keccak256("b"), 1000 * USDC, mehmet, 10_000, ali, 0);   // mehmet 1000 credit
        vm.prank(client);
        c.payInvoice(keccak256("b"));
        // reserve 300, pool 2700, totalCredit 3000
    }

    function test_cannotDistributeBeforePeriodEnds() public {
        vm.prank(ali);
        vm.expectRevert(Collective.PeriodNotOver.selector);
        c.distribute();
    }

    function test_paysProRataToCredit() public {
        vm.warp(block.timestamp + 30 days);
        vm.prank(agent);
        c.distribute();
        assertEq(usdc.balanceOf(ali), 1080 * USDC);    // 2700 * 1200/3000
        assertEq(usdc.balanceOf(ayse), 720 * USDC);
        assertEq(usdc.balanceOf(mehmet), 900 * USDC);
        assertEq(c.pool(), 0);
        assertEq(c.reserve(), 300 * USDC);
        assertEq(c.period(), 1);
    }

    function test_blocklistedMemberDoesNotBlockOthers() public {
        usdc.setBlocked(ayse, true);
        vm.warp(block.timestamp + 30 days);
        vm.prank(ali);
        c.distribute();
        assertEq(usdc.balanceOf(ali), 1080 * USDC);
        assertEq(usdc.balanceOf(mehmet), 900 * USDC);
        assertEq(c.owed(ayse), 720 * USDC);
        assertEq(usdc.balanceOf(address(c)), _accounted());

        address ayseNew = makeAddr("ayse-new-wallet");
        vm.prank(ayse);
        c.claim(ayseNew);
        assertEq(usdc.balanceOf(ayseNew), 720 * USDC);
        assertEq(c.totalOwed(), 0);
    }

    function test_dustStaysInPool() public {
        // three equal creditors on an odd pot
        vm.warp(block.timestamp + 30 days);
        vm.prank(ali);
        c.distribute();
        _invoice(keccak256("c"), 10, ali, 3334, ayse, 6666);
        vm.prank(client);
        c.payInvoice(keccak256("c"));
        vm.warp(block.timestamp + 30 days);
        vm.prank(ali);
        c.distribute();
        assertEq(usdc.balanceOf(address(c)), _accounted());
    }

    function test_emptyPeriodJustRolls() public {
        vm.warp(block.timestamp + 30 days);
        vm.prank(ali);
        c.distribute();
        vm.warp(block.timestamp + 30 days);
        vm.prank(ali);
        c.distribute();
        assertEq(c.period(), 2);
    }

    function test_strangerCannotDistribute() public {
        vm.warp(block.timestamp + 30 days);
        vm.prank(client);
        vm.expectRevert(Collective.NotMemberOrAgent.selector);
        c.distribute();
    }
}
```

- [ ] **Step 2: Run**

Run: `cd contracts && forge test --match-contract DistributionTest -vv`
Expected: 6 tests PASS.

---

### Task 6: Governance — quorum, timelock, members, reserve release

**Files:**
- Create: `contracts/test/Governance.t.sol`

- [ ] **Step 1: Tests**

`contracts/test/Governance.t.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {CollectiveBase} from "./CollectiveBase.t.sol";
import {Collective} from "../src/Collective.sol";
import {Rules} from "../src/CollectiveTypes.sol";

contract GovernanceTest is CollectiveBase {
    function _pass(Collective.Kind kind, bytes memory payload) internal {
        vm.prank(ali);
        uint256 id = c.propose(kind, payload, bytes32(0));
        vm.prank(ayse);
        c.vote(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(ali);
        c.execute(id);
    }

    function test_singleVoteIsNotQuorum() public {
        vm.prank(ali);
        uint256 id = c.propose(Collective.Kind.SetAgent, abi.encode(address(0)), bytes32(0));
        vm.warp(block.timestamp + 1 days);
        vm.prank(ali);
        vm.expectRevert(Collective.NoQuorum.selector);
        c.execute(id);
    }

    function test_timelockEnforced() public {
        vm.prank(ali);
        uint256 id = c.propose(Collective.Kind.SetAgent, abi.encode(address(0)), bytes32(0));
        vm.prank(ayse);
        c.vote(id);
        vm.prank(ali);
        vm.expectRevert(Collective.TimelockActive.selector);
        c.execute(id);
    }

    function test_doubleVoteReverts() public {
        vm.prank(ali);
        uint256 id = c.propose(Collective.Kind.SetAgent, abi.encode(address(0)), bytes32(0));
        vm.prank(ali);
        vm.expectRevert(Collective.AlreadyVoted.selector);
        c.vote(id);
    }

    function test_cannotExecuteTwice() public {
        vm.prank(ali);
        uint256 id = c.propose(Collective.Kind.SetAgent, abi.encode(address(0)), bytes32(0));
        vm.prank(ayse);
        c.vote(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(ali);
        c.execute(id);
        vm.prank(ali);
        vm.expectRevert(Collective.AlreadyExecuted.selector);
        c.execute(id);
    }

    function test_changeRules() public {
        Rules memory r = defaultRules();
        r.reserveBps = 2000;
        _pass(Collective.Kind.SetRules, abi.encode(r));
        assertEq(c.rules().reserveBps, 2000);
    }

    function test_invalidRulesRejected() public {
        Rules memory r = defaultRules();
        r.periodLength = 0;
        vm.prank(ali);
        uint256 id = c.propose(Collective.Kind.SetRules, abi.encode(r), bytes32(0));
        vm.prank(ayse);
        c.vote(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(ali);
        vm.expectRevert(Collective.BadRules.selector);
        c.execute(id);
    }

    function test_addAndRemoveMember() public {
        address zeynep = makeAddr("zeynep");
        _pass(Collective.Kind.AddMember, abi.encode(zeynep));
        assertTrue(c.isMember(zeynep));
        assertEq(c.members().length, 4);
        _pass(Collective.Kind.RemoveMember, abi.encode(zeynep));
        assertFalse(c.isMember(zeynep));
        assertEq(c.members().length, 3);
    }

    function test_removedMemberStillPaidForEarnedCredit() public {
        _invoice(keccak256("job"), 1000 * USDC, mehmet, 5000, ali, 5000);
        vm.prank(client);
        c.payInvoice(keccak256("job"));
        _pass(Collective.Kind.RemoveMember, abi.encode(mehmet));
        vm.warp(block.timestamp + 30 days);
        vm.prank(ali);
        c.distribute();
        assertEq(usdc.balanceOf(mehmet), 450 * USDC); // 900 pool * 500/1000
    }

    function test_releaseReserveOnlyByVote() public {
        _invoice(keccak256("job"), 1000 * USDC, ali, 5000, ayse, 5000);
        vm.prank(client);
        c.payInvoice(keccak256("job"));
        _pass(Collective.Kind.ReleaseReserve, abi.encode(100 * USDC));
        assertEq(c.reserve(), 0);
        assertEq(c.pool(), 1000 * USDC);
    }

    function test_strangerCannotPropose() public {
        vm.prank(client);
        vm.expectRevert(Collective.NotMemberOrAgent.selector);
        c.propose(Collective.Kind.SetAgent, abi.encode(client), bytes32(0));
    }
}
```

- [ ] **Step 2: Run**

Run: `cd contracts && forge test --match-contract GovernanceTest -vv`
Expected: 10 tests PASS.

---

### Task 7: Factory + accounting invariant fuzz

**Files:**
- Create: `contracts/src/CollectiveFactory.sol`, `contracts/test/Factory.t.sol`, `contracts/test/Invariant.t.sol`

**Interfaces:**
- Produces: `CollectiveFactory(IERC20 usdc)`; `create(string name, address[] members, Rules rules, address agent) returns (address)`; `implementation()`; `count()`; `collectiveAt(uint256)`; `collectivesOf(address member) returns (address[])`; event `CollectiveCreated(address indexed collective, address indexed creator, string name)`.

- [ ] **Step 1: Factory**

`contracts/src/CollectiveFactory.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Collective} from "./Collective.sol";
import {Rules} from "./CollectiveTypes.sol";

/// @notice Opens a new collective treasury in one transaction (EIP-1167 clone).
contract CollectiveFactory {
    IERC20 public immutable usdc;
    address public immutable implementation;
    address[] internal _all;
    mapping(address => address[]) internal _byMember;

    event CollectiveCreated(address indexed collective, address indexed creator, string name);

    constructor(IERC20 usdc_) {
        usdc = usdc_;
        implementation = address(new Collective());
    }

    function create(string calldata name, address[] calldata members, Rules calldata rules, address agent)
        external
        returns (address collective)
    {
        collective = Clones.clone(implementation);
        Collective(collective).initialize(usdc, name, members, rules, agent);
        _all.push(collective);
        for (uint256 i; i < members.length; ++i) _byMember[members[i]].push(collective);
        emit CollectiveCreated(collective, msg.sender, name);
    }

    function count() external view returns (uint256) { return _all.length; }
    function collectiveAt(uint256 i) external view returns (address) { return _all[i]; }
    function collectivesOf(address member) external view returns (address[] memory) { return _byMember[member]; }
}
```

- [ ] **Step 2: Factory test**

`contracts/test/Factory.t.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CollectiveFactory} from "../src/CollectiveFactory.sol";
import {Collective} from "../src/Collective.sol";
import {Rules} from "../src/CollectiveTypes.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";

contract FactoryTest is Test {
    function test_createsIndependentCollectives() public {
        MockUSDC usdc = new MockUSDC();
        CollectiveFactory f = new CollectiveFactory(IERC20(address(usdc)));
        address[] memory m = new address[](2);
        m[0] = makeAddr("a"); m[1] = makeAddr("b");
        Rules memory r = Rules(1000, 500e6, 100e6, 200e6, 5001, 1 days, 30 days);
        address c1 = f.create("One", m, r, address(0));
        address c2 = f.create("Two", m, r, address(0));
        assertTrue(c1 != c2);
        assertEq(f.count(), 2);
        assertEq(Collective(c1).name(), "One");
        assertEq(f.collectivesOf(m[0]).length, 2);
        vm.expectRevert();
        Collective(f.implementation()).initialize(IERC20(address(usdc)), "x", m, r, address(0));
    }
}
```

- [ ] **Step 3: Invariant fuzz (Review Focus 5)**

`contracts/test/Invariant.t.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Collective} from "../src/Collective.sol";
import {Rules} from "../src/CollectiveTypes.sol";
import {BlocklistUSDC} from "./mocks/BlocklistUSDC.sol";

contract Handler is Test {
    Collective public c;
    BlocklistUSDC public usdc;
    address[3] public m;
    address public agent;
    address public client = address(0xC1);
    uint256 public n;

    constructor(Collective c_, BlocklistUSDC usdc_, address[3] memory m_, address agent_) {
        c = c_; usdc = usdc_; m = m_; agent = agent_;
        usdc.mint(client, type(uint128).max);
        vm.prank(client);
        usdc.approve(address(c), type(uint256).max);
    }

    function payInvoice(uint96 amount, uint16 shareA) public {
        amount = uint96(bound(amount, 1, 1e15));
        shareA = uint16(bound(shareA, 0, 10_000));
        address[] memory who = new address[](2);
        uint16[] memory sh = new uint16[](2);
        who[0] = m[0]; who[1] = m[1]; sh[0] = shareA; sh[1] = 10_000 - shareA;
        bytes32 id = keccak256(abi.encode(n++));
        vm.prank(m[0]);
        c.createInvoice(id, amount, address(0), who, sh);
        vm.prank(client);
        c.payInvoice(id);
    }

    function sendUnattributed(uint96 amount) public {
        amount = uint96(bound(amount, 1, 1e15));
        vm.prank(client);
        usdc.transfer(address(c), amount);
    }

    function attribute(uint96 amount) public {
        uint256 u = c.unattributed();
        if (u == 0) return;
        uint256 cap = c.rules().autoAttributeCap;
        uint256 a = bound(amount, 1, u < cap ? u : cap);
        vm.prank(agent);
        c.attribute(m[2], a, bytes32(0));
    }

    function toggleBlock(bool blocked) public {
        usdc.setBlocked(m[1], blocked);
    }

    function distribute() public {
        vm.warp(block.timestamp + 31 days);
        vm.prank(m[0]);
        c.distribute();
    }
}

contract InvariantTest is Test {
    Collective c;
    BlocklistUSDC usdc;
    Handler h;

    function setUp() public {
        usdc = new BlocklistUSDC();
        c = Collective(Clones.clone(address(new Collective())));
        address[3] memory m = [address(0xA1), address(0xA2), address(0xA3)];
        address[] memory list = new address[](3);
        list[0] = m[0]; list[1] = m[1]; list[2] = m[2];
        Rules memory r = Rules(1000, 5e12, 1e12, 0, 5001, 1 days, 30 days);
        c.initialize(IERC20(address(usdc)), "Fuzz", list, r, address(0xA9));
        h = new Handler(c, usdc, m, address(0xA9));
        targetContract(address(h));
    }

    function invariant_everyUsdcIsAccountedFor() public view {
        assertEq(usdc.balanceOf(address(c)), c.reserve() + c.pool() + c.totalOwed() + c.unattributed());
        assertGe(usdc.balanceOf(address(c)), c.reserve() + c.pool() + c.totalOwed());
    }
}
```

- [ ] **Step 4: Full suite + gas report**

Run: `cd contracts && forge test -vv && forge test --gas-report --match-contract DistributionTest`
Expected: all tests PASS (≈39 + invariant), no invariant failures.

- [ ] **Step 5: Commit (Tasks 3–7)**

```bash
git add contracts && git commit -m "feat(contracts): factory, governance, expenses, payouts with full test suite"
```

---

### Task 8: Deploy to Arc mainnet and prove the flow

**Files:**
- Create: `contracts/script/Deploy.s.sol`, `contracts/script/README.md`, `deployments/arc-mainnet.json`

**Decision recorded:** testnet faucet needs manual captcha; we deploy straight to mainnet with tiny amounts (deploy ≈ cents; demo invoice 0.10 USDC). Unit tests already cover behaviour; the mainnet run verifies Arc-specific parts (real USDC, Memo + `msg.sender`).

- [ ] **Step 1: Deployer keystore (no MetaMask key in tooling)**

```bash
mkdir -p ~/.orta/keystore && chmod 700 ~/.orta
openssl rand -hex 24 > ~/.orta/pw && chmod 600 ~/.orta/pw
cast wallet new ~/.orta/keystore --password-file ~/.orta/pw   # prints the new address
```
Bekir sends 2 USDC on Arc from MetaMask to the printed address. Verify:
```bash
cast call 0x3600000000000000000000000000000000000000 "balanceOf(address)(uint256)" <DEPLOYER> --rpc-url arc
```
Expected: `2000000`.

- [ ] **Step 2: Deploy script**

`contracts/script/Deploy.s.sol`
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CollectiveFactory} from "../src/CollectiveFactory.sol";

contract Deploy is Script {
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (CollectiveFactory f) {
        vm.startBroadcast();
        f = new CollectiveFactory(IERC20(ARC_USDC));
        vm.stopBroadcast();
        console2.log("factory", address(f));
        console2.log("implementation", f.implementation());
    }
}
```

- [ ] **Step 3: Deploy + verify**

```bash
cd contracts
forge script script/Deploy.s.sol --rpc-url arc --keystore ~/.orta/keystore/<FILE> --password-file ~/.orta/pw --broadcast --verify --verifier blockscout --verifier-url https://explorer.arc.io/api/
```
Expected: factory + implementation addresses printed, both verified on explorer.arc.io. Write them to `deployments/arc-mainnet.json`:
```json
{ "chainId": 5042, "usdc": "0x3600000000000000000000000000000000000000", "memo": "0x5294E9927c3306DcBaDb03fe70b92e01cCede505", "factory": "<addr>", "implementation": "<addr>", "deployedAt": "<iso date>", "deployTx": "<hash>" }
```

- [ ] **Step 4: Live flow (deployer acts as member + payer, amounts tiny)**

```bash
F=<factory>; D=<deployer>; K="--keystore ~/.orta/keystore/<FILE> --password-file ~/.orta/pw --rpc-url arc"
# 1. create a collective: members = deployer + Bekir's MetaMask, rules: 10% reserve to 1 USDC, period 1 hour, timelock 1 hour (floor), quorum 2-of-2
cast send $F "create(string,address[],(uint16,uint256,uint256,uint256,uint16,uint32,uint32),address)" "Proof Guild" "[$D,0x39AEfbC8388da12907A21d9De888B288a9fa5794]" "(1000,1000000,1000000,1000000,5001,3600,3600)" $D $K
C=$(cast call $F "collectiveAt(uint256)(address)" 0 --rpc-url arc)
# 2. invoice 0.10 USDC, 70/30
SALT=$(cast keccak "proof-invoice-1")
cast send $C "createInvoice(bytes32,uint256,address,address[],uint16[])" $SALT 100000 0x0000000000000000000000000000000000000000 "[$D,0x39AEfbC8388da12907A21d9De888B288a9fa5794]" "[7000,3000]" $K
# 3. approve + pay THROUGH MEMO (checks Arc Memo preserves msg.sender for transferFrom)
cast send 0x3600000000000000000000000000000000000000 "approve(address,uint256)" $C 100000 $K
ID=$(cast call $C "invoiceId(address,bytes32)(bytes32)" $D $SALT --rpc-url arc)
cast send 0x5294E9927c3306DcBaDb03fe70b92e01cCede505 "memo(address,bytes,bytes32,bytes)" $C $(cast calldata "payInvoice(bytes32,uint256)" $ID 100000) $ID 0x $K
cast call $C "pool()(uint256)" --rpc-url arc      # expect 90000
cast call $C "reserve()(uint256)" --rpc-url arc   # expect 10000
```
Expected: `InvoicePaid` and Arc `Memo` events in the same tx on explorer. If the Memo call reverts, fall back to `cast send $C "payInvoice(bytes32,uint256)" $ID 100000` and record the finding in `contracts/script/README.md`.

- [ ] **Step 5: Real distribution after the period**

After 1 hour:
```bash
cast send $C "distribute()" $K
```
Expected: `Distributed(0, 90000, 0)`; deployer +63000, MetaMask +27000 (μUSDC). Record all tx hashes in `deployments/arc-mainnet.json` under `"proof"`.

- [ ] **Step 6: Commit + push**

```bash
git add contracts/script deployments && git commit -m "feat(deploy): collective factory live on Arc mainnet with proof flow"
```
(Remote created when the name is final; push then.)

---

## Post-review changes (2026-10-09)

Security review I1-I5 fixed before deploy: proposals snapshot votesNeeded/executableAt/expiresAt + governance epoch, cancel/unvote; quorum > 50%, timelock >= 1h, period 1h..366d, min 2 votes with 2+ members; agent attribution cap per period; invoice id = keccak(collective, creator, salt) and payInvoice(id, expectedAmount); ReleaseReserve pays named recipients. Event Initialized renamed CollectiveInitialized; InvoiceCreated/Proposed carry full data.

## Self-review notes

- Spec §5.1–5.2 → Tasks 2–7; §5.3 Memo → Task 8 Step 4; §8 testing → Tasks 2–7 + invariant; §9 native-USDC risk resolved by using ERC-20 interface only (spec updated accordingly in this plan's Global Constraints).
- Agent decision log via Memo (§5.3, second bullet) belongs to the Phase 2 agent plan.
- Front end (§7) belongs to the front-end plan after theme selection.
