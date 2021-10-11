// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract ZARP is ERC20, ERC20Burnable, AccessControl, Pausable {
  mapping(address => bool) private _verified;
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
  bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

  event AddressVerificationChanged(address indexed account, address indexed sender, bool verificationStatus);

  constructor() ERC20("ZARP Stablecoin", "ZARP") {
    _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
  }

  function verify(address account) public whenNotPaused onlyRole(VERIFIER_ROLE) {
    _verified[account] = true;
    emit AddressVerificationChanged(account, _msgSender(), true);
  }

  function removeVerification(address account) public whenNotPaused onlyRole(VERIFIER_ROLE) {
    _verified[account] = false;
    emit AddressVerificationChanged(account, _msgSender(), false);
  }

  function isVerified(address account) public view virtual returns (bool) {
    return _verified[account];
  }

  function mint(address account, uint256 amount) public onlyRole(MINTER_ROLE) {
    require(_verified[account], "Account needs to be verified to accept minting");
    _mint(account, amount);
  }

  function burn(uint256 amount) public override onlyRole(BURNER_ROLE) {
    super.burn(amount);
  }

  function burnFrom(address account, uint256 amount) public override onlyRole(BURNER_ROLE) {
    super.burnFrom(account, amount);
  }

  function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
    if (hasRole(BURNER_ROLE, recipient)) {
      require(_verified[_msgSender()], "Sender Account needs to be verified to allow transfer to burn account");
    }
    _transfer(_msgSender(), recipient, amount);
    return true;
  }

  function pause() public onlyRole(DEFAULT_ADMIN_ROLE) {
    _pause();
  }

  function unpause() public onlyRole(DEFAULT_ADMIN_ROLE) {
    _unpause();
  }

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 amount
  ) internal override whenNotPaused {
    super._beforeTokenTransfer(from, to, amount);
  }
}
