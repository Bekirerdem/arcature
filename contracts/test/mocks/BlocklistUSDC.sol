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
