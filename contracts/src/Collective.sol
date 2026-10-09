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
