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
