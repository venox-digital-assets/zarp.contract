// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

/**
 * @title ERC20Basic
 * @dev Simpler version of ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/179
 */
abstract contract ERC20 {
    function totalSupply() public virtual view returns (uint256);
    function balanceOf(address who) public virtual view returns (uint256);
    function transfer(address to, uint256 value) public virtual returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
}

library SafeMath {
    function mul(uint256 a, uint256 b) internal pure returns (uint256 c) {
        if (a == 0) {
          return 0;
        }
        c = a * b;
        assert(c / a == b);
        return c;
    }

    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        return a / b;
    }

    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        assert(b <= a);
        return a - b;
    }

    function add(uint256 a, uint256 b) internal pure returns (uint256 c) {
        c = a + b;
        assert(c >= a);
        return c;
    }
}

library Sigs {
    function splitSig(bytes memory sig) internal pure returns (uint8 v, bytes32 r, bytes32 s){
        require(sig.length == 65);
        
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
       
        return (v,r,s);
    }
    
    function numSigs(bytes memory sigs) internal pure returns (uint256){
        require(sigs.length % 65 == 0);
        return sigs.length/65;
    }
    
    
}

/**
 * @title Zarp token
 * @dev ERC20 for Zarp token with multisig minting and whitelisting.
 */
contract ZarpToken is ERC20 {
    using SafeMath for uint256;
    using Sigs for bytes;
    
    mapping(address => uint256) public balances;
    mapping(address => uint256) public burnBalances;
    mapping(address => bool) public whitelist;

    uint256 private _totalSupply;
      
    address public owner;
      
    mapping (address => bool) private _canMint;
    mapping (address => bool) private _canWhitelist;
    mapping (address => bool) private _canBurn;
    uint8 private _canWhitelistNum = 0;
    uint8 private _canMintNum = 0;
    uint8 private _canBurnNum = 0;

    uint8 public mintNumSigsRequired = 1;
    uint8 public whitelistNumSigsRequired = 1;
    bool private _allowSigLock = false; //allows number of sigs required to be greater thar number of signatries

    uint8 private _whitelistSettings = 0;
    /*
        0 - can transfer from and to an unwhitelisted account
        1 - can transfer to an unwhitelisted account but not from
        2 - can transfer from an unwhitelisted account but not to
        3 - can only transfer to or from a whiltelisted account
    */
    
    bool private _anyoneCanBurn = false;

    event Minted(uint256 value, address minter, address to);
    event Burned(uint256 value, address burner);
   
      
    modifier isOwner() {
        require(msg.sender==owner);
        _;
    }
    
     constructor (address _owner) public {
        owner = _owner;
    }

    /**
    * @dev total number of tokens in existence
    */
    function totalSupply() override public view returns (uint256) {
        return _totalSupply;
    }
    
    /**
    * @dev transfer token for a specified address
    * @param _to The address to transfer to.
    * @param _value The amount to be transferred.
    */
    function transfer(address _to, uint256 _value) override public returns (bool) {
        require(_value <= balances[msg.sender]);
        if(_to == address(0)){
            burn(_value);
            return true;
        }
        //require whitelist rules
        require(
            _whitelistSettings==0 || 
            (_whitelistSettings==1 && whitelist[msg.sender]) ||
            (_whitelistSettings==2 && whitelist[_to]) ||
            (_whitelistSettings==3 && whitelist[msg.sender] && whitelist[_to])
        );
        balances[msg.sender] = balances[msg.sender].sub(_value);
        balances[_to] = balances[_to].add(_value);
        emit Transfer(msg.sender, _to, _value);
        return true;
    }
    
    /**
    * @dev Gets the balance of the specified address.
    * @param _owner The address to query the the balance of.
    * @return An uint256 representing the amount owned by the passed address.
    */
    function balanceOf(address _owner) override public view returns (uint256) {
        return balances[_owner];
    }
    
    // TODO: 2 vs. 8?
    function decimals() public pure returns (uint8) {
        return 2;
    }
    
    // TODO: How is this typically used?
    function rounding() public pure returns (uint8) {
        return 2;
    }
    
    function name() public pure returns (string memory) {
        return "ZarpToken";
    }
    
    function symbol() public pure returns (string memory) {
        return "ZARP";
    }
      
    /** Non-ERC20 functions **/
    
    /**
     * @dev checks for dups in the signer array - to prevent a miscount of sigs if sigs are entered more than once
     * @param signers an address array containing one or many ddresses
     * @param signer - the address to check for
     * @param ln - the current position in the array - ie. no need to check this item or beyond that
     */
    function _exists(address[] memory signers, address signer, uint256 ln) private pure returns(bool){
        for(uint256 i=0;i<ln;i++){
            if(signers[i]==signer) return true;
        }
        return false;
    }
    
    /**
     * @dev fetches a list of signers for a given list of signatures of a message
     * @param sigs - a byte array containing one of many signatures
     * @param message - the message being signed
     */
    function _getSigners(bytes calldata sigs, bytes32 message) private pure returns(address[] memory){
        require(sigs.length % 65 == 0);
        uint256 _numSigs = sigs.numSigs();
        address[] memory signers = new address[](_numSigs);
        for(uint256 i=0;i<_numSigs;i++){
            uint256 idx = i*65;
            bytes calldata sigData = sigs[idx:idx+65];
            
            (uint8 v, bytes32 r, bytes32 s) = sigData.splitSig();
            address signer = ecrecover(message, v, r, s);
            //check that this is a new signer
            if(i==0){
                signers[i] = signer;
            }
            else{
                if(!_exists(signers,signer,i)) signers[i] = signer;
            }
        }
        return signers;
    }
    
    /**
     * @dev validates sigs to and checks whether signers can whitelist or minters
     * @param sigs an byte array containing one or many signatures
     * @param message keccak256 of minting or whitelisting parameters, signed by the signers
     * @param checkMint check whether signers can minting
     * @param checkWhitelist check whether signers can whitelist
     */
    function _validate(bytes calldata sigs, bytes32 message, bool checkMint, bool checkWhitelist) private view returns (bool){
        require(checkMint || checkWhitelist);
        //if(msg.sender==owner) return true;
        uint256 minters = 0;
        uint256 whitelisters = 0;
        if(_canMint[msg.sender]) minters++;
        if(_canWhitelist[msg.sender]) whitelisters++;
        
        address[] memory signers = _getSigners(sigs,message);
        for(uint256 i=0;i<signers.length;i++){
            if(signers[i]!=0x0000000000000000000000000000000000000000){
                if(!_canMint[signers[i]]) minters++;
                if(_canWhitelist[signers[i]]) whitelisters++;
            }
        }
        if(checkMint && minters<mintNumSigsRequired) return false; //???
        if(checkWhitelist && whitelisters<whitelistNumSigsRequired) return false; //???
        return true;
    }
    
    /** Whitelisting functions **/

    /**
     * @dev whitelists a user
     * @param account to be whitelisted 
     * @param sigs optional list of one or more signatures is whitelistNumSigsRequired>0
     */
    function whitelistUser(address account, bytes calldata sigs) public {
        require(_validate(sigs,keccak256(abi.encodePacked(account)),false,true));
        whitelist[account] = true;
    }
      
    /**
     * @dev remover a user from the whitelist
     * @param account to be unwhitelisted 
     * @param sigs optional list of one or more signatures is whitelistNumSigsRequired>0
     */
    function unWhitelistUser(address account, bytes calldata sigs) public {
        require(_validate(sigs,keccak256(abi.encodePacked(account)),false,true));
        whitelist[account] = false;
    }
     
     /**
     * @dev checks whether a user is whitelisted
     * @param account to be hecked
     */
    function isWhitelisted(address account) public view returns (bool){
        return whitelist[account];
    }
    
      
    /** Minting functions **/
    /**
     * @dev mints more Zarp
     * @param account that the newly minted Zarp is sent to
     * @param amount of Zarp to be minted 
     * @param sigs - optional list of signatures if mintNumSigsRequired>0
     */
    function mint(address account,uint256 amount, bytes calldata sigs) public {
        bytes32 m = keccak256(abi.encodePacked(account,amount));
        require(account != address(0) && amount > 0);
        require(_validate(sigs,m,true,false));
        
        _totalSupply = _totalSupply.add(amount);
        balances[account] = balances[account].add(amount);
        emit Minted(amount,msg.sender, account);
        emit Transfer(address(0), account, amount);
        //if can whitelist then whitelist ????
        if(!_validate(sigs,m,false,true)) return;
        whitelist[account] = true;
    }
    

    /** Burn **/
    /**
     * @dev allows a user to burn their zarp - in the event of withdrawing for ZAR
     * @param amount of Zarp to burn
     */
    function burn(uint256 amount) public{
        if(!_anyoneCanBurn){
            require(_canBurn[msg.sender]);
        }
        require(balances[msg.sender]>=amount);
        balances[msg.sender] = balances[msg.sender].sub(amount);
        burnBalances[msg.sender] = burnBalances[msg.sender].add(amount);
        //_totalSupply = _totalSupply.sub(amount);
        emit Burned(amount,msg.sender);
    }
    
    /**
     * @dev allows a minter to empty out the burnBalance once burning has been finalized
     * @param amount of Zarp to empty from burnBalance
     * @param account - address of account where the burn balance is held
     * @param sigs - optional list of signatures if mintNumSigsRequired>0
     */
    function burnFinal(uint256 amount,address account, bytes calldata sigs) public {
        bytes32 m = keccak256(abi.encodePacked(amount,account));
        require(burnBalances[account]>=amount);
        require(_validate(sigs,m,true,false));
        burnBalances[account] = burnBalances[account].sub(amount);
        _totalSupply = _totalSupply.sub(amount);
    }
    
    /**
     * @dev allows a minter to 'unburn' an amount back to a user
     * @param amount of Zarp to empty from burnBalance
     * @param account - address to send the amount to
     * @param sigs - optional list of signatures if mintNumSigsRequired>0
     */
    function unBurn(uint256 amount, address account, bytes calldata sigs) public {
        bytes32 m = keccak256(abi.encodePacked(amount,account));
        require(burnBalances[account]>=amount);
        require(_validate(sigs,m,true,false));
        burnBalances[account] = burnBalances[account].sub(amount);
        balances[account].add(amount);
    }
    
    /*** Admin functions ****/
    /** 
    * @dev changes the owner of the contract
    * @param newOwner the address of the new owner
    */
    function changeOwner(address newOwner) public isOwner{
        owner = newOwner;
    }
    
    /** 
    * @dev adds a minter to the canMint list
    * @param minter - address of new minter
    */
    function addToCanMint(address minter) public isOwner{
        require(minter != address(0) && !_canMint[minter]);
        _canMint[minter] = true;
        _canMintNum ++;
    }
      
    /** 
    * @dev removes a minter to the canMint list
    * @param minter - address of the minter to remove
    */
    function removeFromCanMint(address minter) public isOwner{
        require(_canMintNum>0 && _canMint[minter]);
        if(!_allowSigLock){
            require(mintNumSigsRequired<_canMintNum);
        }
        _canMint[minter] = false;
        _canMintNum--;
    }
    
    /** 
    * @dev adds a whitelister
    * @param whitelister - address of whitelister to add
    */
    function addToCanWhiteList(address whitelister) public isOwner{
        require(whitelister != address(0) && !_canWhitelist[whitelister]);
        _canWhitelist[whitelister] = true;
        _canWhitelistNum ++;
    }
      
    /** 
    * @dev removes a whitelister
    * @param whitelister - address of whitelister to remove
    */
    function removeFromCanWhiteList(address whitelister) public isOwner{
        require(_canWhitelistNum>0 && _canWhitelist[whitelister]);
        if(!_allowSigLock){
            require(whitelistNumSigsRequired<_canWhitelistNum);
        }
        _canWhitelist[whitelister] = false;
        _canWhitelistNum --;
    }
    
    /** 
    * @dev change a whitelist settings
    * @param settings to change
    */
    function updateWhitelistSettings(uint8 settings) public isOwner{
        require(settings<=3);
        /*
            0 - can transfer from and to an unwhitelisted account
            1 - can transfer to an unwhitelisted account but not from
            2 - can transfer from an unwhitelisted account but not to
            3 - can only transfer to or from a whiltelisted account
        */
        _whitelistSettings = settings;
    }
    
    /** 
    * @dev adds a burner
    * @param burner - address of burner to add
    */
    function addToCanBurn(address burner) public isOwner{
        require(burner != address(0) && !_canBurn[burner]);
        _canBurn[burner] = true;
        _canBurnNum ++;
    }
    
    /** 
    * @dev removes a burner
    * @param burner - address of burner to remove
    */
    function removeFromCanBurn(address burner) public isOwner{
        require(_canBurnNum>0 && _canBurn[burner]);
        _canBurn[burner] = false;
        _canBurnNum --;
    }
    
    /** 
    * @dev change a burn settings
    * @param anyoneCanBurn - sets whether anyone can burn, or only burners
    */
    function updateBurnSettings(bool anyoneCanBurn) public isOwner{
        _anyoneCanBurn = anyoneCanBurn;
    }
    
    /** 
    * @dev changes the number of signatures required to whitelist
    * @param numSigs - number of sigs required
    */
    function updateNumWhitelistSigsRequired(uint8 numSigs) public isOwner{
        if(!_allowSigLock){
            require(numSigs<=_canWhitelistNum);
        }
        whitelistNumSigsRequired = numSigs;
    }
    
    /** 
    * @dev changes the number of signatures required to mint
    * @param numSigs - number of sigs required
    */
    function updateNumMintSigsRequired(uint8 numSigs) public isOwner{
        if(!_allowSigLock){
            require(numSigs<=_canMintNum);
        }
        mintNumSigsRequired = numSigs;
    }
    
    /** 
    * @dev allows or disallows number os sigs required to be > number of signatories
    * @param allow - or disallow
    */
    function allowSigLock(bool allow) public isOwner{
        _allowSigLock = allow;
    }
      
}
