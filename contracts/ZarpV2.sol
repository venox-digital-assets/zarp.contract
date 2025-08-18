// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Zarp} from "./Zarp.sol";

/**
 * @title ZarpV2
 * @notice Minimal V2 upgrade adding a version() getter to demonstrate upgrade flow.
 * @dev No new storage variables are introduced to preserve layout. Future
 *      expansions can use EmptyGap pattern already present in Zarp.
 */
contract ZarpV2 is Zarp {
  function version() external pure returns (string memory) {
    return "2";
  }
}
