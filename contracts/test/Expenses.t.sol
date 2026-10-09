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
