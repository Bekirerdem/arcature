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
