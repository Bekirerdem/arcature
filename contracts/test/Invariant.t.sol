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
