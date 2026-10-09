// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Rules a collective runs by. Changed only through an executed proposal.
struct Rules {
    uint16 reserveBps;           // share of every income moved to reserve while reserve < reserveTarget
    uint256 reserveTarget;       // USDC (6 dec) the reserve fills up to
    uint256 autoAttributeCap;    // max USDC the agent may attribute per period without a vote
    uint256 expenseCapPerPeriod; // max USDC the agent may spend per period without a vote
    uint16 quorumBps;            // share of members whose votes execute a proposal
    uint32 timelock;             // seconds between proposal creation and execution
    uint32 periodLength;         // seconds per payout period
}
