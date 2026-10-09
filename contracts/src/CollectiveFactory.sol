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
