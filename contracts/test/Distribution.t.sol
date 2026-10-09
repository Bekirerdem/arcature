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
