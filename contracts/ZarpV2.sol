// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.9;

// import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-ERC20PermitUpgradeable.sol";
// import "./Zarp.sol"; // Import your original ZarpV1 contract

// /**
//  * @dev ZARP Stablecoin ERC20 contract V2.
//  *
//  * This version adds ERC20Permit for gasless transactions and includes an internal
//  * getter for the _verified mapping.
//  */
// contract ZarpV2 is Zarp, ERC20PermitUpgradeable {
//   uint8 internal _initializedVersion;

//   /**
//    * @notice Initialize V2
//    */
//   function initializeV2() public reinitializer(2) {
//     __ERC20Permit_init("ZARP Stablecoin");
//     require(_initializedVersion == 0, "Already initialized");
//     _initializedVersion = 1;
//   }

//   /**
//    * @dev Overriding existing transfer method to keep logic consistent.
//    * Implements gasless approvals through ERC20Permit.
//    */
//   function transfer(address recipient, uint256 amount) public virtual override(ERC20Upgradeable, Zarp) returns (bool) {
//     if (hasRole(BURNER_ROLE, recipient)) {
//       require(_isVerifiedInternal(_msgSender()), "Sender Account needs to be verified to allow transfer to burn account");
//     }
//     return super.transfer(recipient, amount); // Call the parent transfer function
//   }

//   /**
//    * @notice Update allowance with a signed permit (ERC20Permit)
//    * @param owner       Token owner's address (Authorizer)
//    * @param spender     Spender's address
//    * @param value       Amount of allowance
//    * @param deadline    The time at which the signature expires (unix time), or max uint256 value to signal no expiration
//    * @param v           v of the signature
//    * @param r           r of the signature
//    * @param s           s of the signature
//    */
//   function permit(
//     address owner,
//     address spender,
//     uint256 value,
//     uint256 deadline,
//     uint8 v,
//     bytes32 r,
//     bytes32 s
//   ) public override whenNotPaused {
//     // Must be `public` and `override`
//     super.permit(owner, spender, value, deadline, v, r, s); // Call parent contract's `permit`
//   }

//   /**
//    * @dev Override _beforeTokenTransfer to handle the multiple base classes that define it.
//    */
//   function _beforeTokenTransfer(address from, address to, uint256 amount) internal virtual override(ERC20Upgradeable, Zarp) {
//     // Call parent implementations of _beforeTokenTransfer
//     super._beforeTokenTransfer(from, to, amount); // from ERC20Upgradeable and Zarp
//   }
// }
