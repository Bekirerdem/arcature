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
        Collective impl = Collective(f.implementation());
        vm.expectRevert();
        impl.initialize(IERC20(address(usdc)), "x", m, r, address(0));
    }
}
