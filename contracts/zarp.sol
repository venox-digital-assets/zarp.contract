// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
  * @title ZARP is an {ERC20} token that is backed 1:1 by ZAR, audited 
  * frequently, and minted and burned only to verified accounts. 
  * 
  * @dev ZARP uses AccessControl as follows:
  * - BURNER_ROLE:
  *   - Only role that can burn or burnFrom tokens 
  *   - Can only burn tokens from self 
  *   - Only accepts transfers from verified addresses
  *   - Can not be verified
  * - MINTER_ROLE:
  *   - Only role that can mint tokens
  *   - Can only mint to verified addresses 
  *   - Can not be verified  
  * - VERIFIER_ROLE:
  *   - Only role that can verify / removeVerification on addresses
  *   - Can not be verified  
  */
contract ZARP is ERC20, Ownable, AccessControl, ERC20Burnable {
  mapping (address => bool) private _verified;
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
  bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

  /**
    * @dev Emitted when `verificationStatus` is changed on account (`account`) by
    * sender (`sender`).
    */
  event AddressVerificationChanged(address indexed account, address indexed sender, bool verificationStatus);

  /**
    * @dev Sets the values for {name} and {symbol}, on {ERC20} and decimals as 2
    * - AccessControl: assigns `DEFAULT_ADMIN_ROLE` to the calling addresss
    * 
    * {name}, {symbol} and {decimals} are immutable: they can only be set once during
    * construction.
    */
  constructor() ERC20("ZARP (Rand Reserve)", "ZARP") {
    _setupDecimals(2);
    _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
  }

  /**
    * @dev Destroys `amount` tokens from the caller.
    * 
    * See {ERC20-_burn}.
    * 
    * Requirements:
    * 
    * - AccessControl: requires `BURNER_ROLE`
    */
  function burn(uint256 amount) override public onlyBurnerRole {
    super.burn(amount);
  }

  /**
    * @dev Destroys `amount` tokens from `account`, deducting from the caller's
    * allowance.
    *
    * See {ERC20-_burn} and {ERC20-allowance}.
    *
    * Requirements:
    * 
    * - the caller must have allowance for ``accounts``'s tokens of at least
    * `amount`.
    * - AccessControl: requires `MINTER_ROLE`
    */
  function burnFrom(address account, uint256 amount) override public onlyBurnerRole {
    super.burnFrom(account, amount);
  }

  /**
    * @dev Checks whether `account` is in the list of `verified` accounts.
    */  
  function isVerified(address account) public view virtual returns (bool) {
    return _verified[account];
  }

  /** @dev Creates `amount` tokens and assigns them to `account`, increasing
    * the total supply.
    *
    * Emits a {Transfer} event with `from` set to the zero address.
    *
    * Requirements:
    *
    * - `account` cannot be the zero address.
    * - AccessControl: requires `MINTER_ROLE`
    */
  function mint(address account, uint256 amount) public onlyMinterRole {
    require(_verified[account], "Account needs to be verified to accept minting");
    _mint(account, amount);
  }

  /**
    * @dev Throws if called without having the `BURNER_ROLE`
    */
  modifier onlyBurnerRole() {
    require(hasRole(BURNER_ROLE, _msgSender()), "Sender doesnt have the BURNER_ROLE role");
    _;
  }

  /**
    * @dev Throws if called without having the `MINTER_ROLE`
    */
  modifier onlyMinterRole() {
    require(hasRole(MINTER_ROLE, _msgSender()), "Sender doesnt have the MINTER_ROLE role");
    _;
  }

  /**
    * @dev Throws if called without having the `VERIFIER_ROLE`
    */
  modifier onlyVerifierRole() {
    require(hasRole(VERIFIER_ROLE, _msgSender()), "Sender doesnt have the VERIFIER_ROLE role");
    _;
  }   

  /**
    * @dev Removes `account` from the list of `verified` accounts.
    * 
    * Requirements:
    * 
    * - AccessControl: requires `VERIFICATION_ROLE`
    */  
  function removeVerification(address account) public onlyVerifierRole {
    _verified[account] = false;
    emit AddressVerificationChanged(account, _msgSender(), false);
  }

  /**
    * @dev See {IERC20-transfer}
    *
    * Requirements:
    *
    * - when sending to `BURNER_ROLE`, `sender` must be `verified`
    * - `recipient` cannot be the zero address
    * - the caller must have a balance of at least `amount`
    */
  function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
    if (hasRole(BURNER_ROLE, recipient)) {
      require(_verified[_msgSender()], "Sender Account needs to be 'verified' to allow transfer to burn account");
    }
    _transfer(_msgSender(), recipient, amount);
    return true;
  }

  /**
    * @dev Adds `account` to the list of `verified` accounts.
    * 
    * Requirements:
    * 
    * AccessControl: 
    *   - requires `VERIFICATION_ROLE`
    */  
  function verify(address account) public onlyVerifierRole {
    require(hasRole(MINTER_ROLE, account) == false, "MINTER_ROLE role not allowed to be verified");
    require(hasRole(BURNER_ROLE, account) == false, "BURNER_ROLE role not allowed to be verified");
    require(hasRole(VERIFIER_ROLE, account) == false, "VERIFIER_ROLE role not allowed to be verified");
    require(hasRole(DEFAULT_ADMIN_ROLE, account) == false, "DEFAULT_ADMIN_ROLE role not allowed to be verified");
    require(owner() != account, "Owner not allowed to be verified");
    _verified[account] = true;
    emit AddressVerificationChanged(account, _msgSender(), true);
  } 
}