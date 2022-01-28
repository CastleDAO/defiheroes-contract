// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/* 

      _____________________________________
     |                                     |
     |                  The                |
     |               Simples               |
     |_____________________________________|
     

*/

contract Simples is
  ERC721,
  ERC721Enumerable,
  Pausable,
  Ownable,
  ReentrancyGuard,
  AccessControl
{
  using Counters for Counters.Counter;

  // Create a new role identifier for the game role
  bytes32 public constant GAME_ROLE = keccak256("GAME_ROLE");

  uint256 public price = 0; //0 ETH :)
  uint256 private _maxSupply = 2000;
  uint256 private _maxMintAmount = 2;
  mapping(address => bool) public whitelisted;

  Counters.Counter private _tokenIdCounter;

  struct warrior {
    uint256 speed;
    uint256 intelligence;
    uint256 strength;
    uint256 abilityPower;
    uint256 defense;
    uint256 agility;
    uint256 magicResistance;
    uint256 constitution;
    uint256 level;
    uint256 createdAt;
  }

  mapping(uint256 => warrior) public warriors;
  mapping(uint256 => uint256) public experience;
  mapping(uint256 => uint256) public warriorsQuestLog;

  uint256 public xpPerQuest = 100;
  uint256 public maxLevelWarriors = 10;
  uint256 constant DAY = 1 days;

  event WarriorCreated(uint256 tokenId, warrior warriorCreated);

  event LeveledUp(address indexed leveler, uint256 tokenId, uint256 level);
  event ExperienceSpent(uint256 tokenId, uint256 xpSpent, uint256 xpRemaining);
  event ExperienceGained(
    uint256 tokenId,
    uint256 xpGained,
    uint256 xpRemaining
  );
  event Quest(uint256 tokenId, uint256 xpGained, uint256 xpTotal);

  event NFTCreated(uint256 indexed tokenId);

  constructor(string memory newBaseURI, uint256 newMaxSupply)
    ERC721("Simples", "SIMPLES")
  {
    setBaseURI(newBaseURI);
    setMaxSupply(newMaxSupply);

    // Increment tokenIdCounter so it starts at one
    _tokenIdCounter.increment();
  }

  function getCurrentTokenId() public view returns (uint256) {
    return _tokenIdCounter.current();
  }

  function setPublicPrice(uint256 newPrice) public onlyOwner {
    price = newPrice;
  }

  function setMaxSupply(uint256 _newMaxSupply) private {
    _maxSupply = _newMaxSupply;
  }

  function ownerWithdraw() external onlyOwner {
    payable(owner()).transfer(address(this).balance);
  }

  function pause() public onlyOwner {
    _pause();
  }

  function unpause() public onlyOwner {
    _unpause();
  }

  // Create warriors
  function _createWarriro(uint256 _tokenId) internal {
    warriors[_tokenId].speed = randomFromString(
      string(abi.encodePacked("speed", toString(_tokenId))),
      12
    );

    warriors[_tokenId].intelligence = randomFromString(
      string(abi.encodePacked("intelligence", toString(_tokenId))),
      12
    );

    warriors[_tokenId].strength = randomFromString(
      string(abi.encodePacked("strength", toString(_tokenId))),
      12
    );

    warriors[_tokenId].abilityPower = randomFromString(
      string(abi.encodePacked("abilityPower", toString(_tokenId))),
      12
    );

    warriors[_tokenId].defense = randomFromString(
      string(abi.encodePacked("defense", toString(_tokenId))),
      12
    );

    warriors[_tokenId].agility = randomFromString(
      string(abi.encodePacked("agility", toString(_tokenId))),
      12
    );

    warriors[_tokenId].magicResistance = randomFromString(
      string(abi.encodePacked("magicResistance", toString(_tokenId))),
      12
    );

    warriors[_tokenId].constitution = randomFromString(
      string(abi.encodePacked("constitution", toString(_tokenId))),
      12
    );
    warriors[_tokenId].level = 1;
    experience[_tokenId] = 0;

    emit WarriorCreated(_tokenId, warriors[_tokenId]);
  }

  /**
   * @dev Base URI for computing {tokenURI}. Empty by default, can be overriden
   * in child contracts.
   */
  string private baseURI = "";

  function _baseURI() internal view virtual override returns (string memory) {
    return baseURI;
  }

  function setBaseURI(string memory newBaseURI) public onlyOwner {
    baseURI = newBaseURI;
  }

  // Mint
  modifier tokenMintable(uint256 tokenId) {
    require(tokenId > 0 && tokenId <= _maxSupply, "Token ID invalid");
    require(price <= msg.value, "Ether value sent is not correct");
    _;
  }

  function _internalMint(address _address) internal returns (uint256) {
    // minting logic
    uint256 current = _tokenIdCounter.current();
    require(current <= _maxSupply, "Max token reached");

    _createWarriro(current);
    _safeMint(_address, current);
    emit NFTCreated(current);
    _tokenIdCounter.increment();

    return current;
  }

  function mint()
    public
    payable
    nonReentrant
    tokenMintable(_tokenIdCounter.current())
  {
    address to = _msgSender();
    _internalMint(to);
  }

  function mintMultiple(uint256 _num) public payable {
    uint256 supply = totalSupply();
    address to = _msgSender();
    require(_num > 0, "The minimum is one token");
    require(_num <= _maxMintAmount, "You can mint a max of 2 tokens");
    require(supply + _num <= _maxSupply, "Exceeds maximum supply");
    require(msg.value >= price * _num, "Ether sent is not enough");

    for (uint256 i; i < _num; i++) {
      _internalMint(to);
    }
  }

  function ownerMint(uint256 amount, address _address)
    public
    nonReentrant
    onlyOwner
  {
    uint256 supply = totalSupply();
    require(amount > 0, "The minimum is one token");

    require(supply + amount <= _maxSupply, "Exceeds maximum supply");

    for (uint256 i = 1; i <= amount; i++) {
      _internalMint(_address);
    }
  }

  // Quests and levels

  function setMaxLevels(uint256 _newMaxLevels) public onlyOwner {
    maxLevelWarriors = _newMaxLevels;
  }

  function setXPPerQuest(uint256 _newXPPerQuest) public onlyOwner {
    xpPerQuest = _newXPPerQuest;
  }

  function spendExperience(uint256 _tokenId, uint256 _experience) public {
    require(
      _isApprovedOrOwner(msg.sender, _tokenId) ||
        hasRole(GAME_ROLE, msg.sender),
      "Does not have permission"
    );
    require(_experience <= experience[_tokenId], "Not enough experience");

    experience[_tokenId] -= _experience;

    emit ExperienceSpent(_tokenId, _experience, experience[_tokenId]);
  }

  function addExperience(uint256 _tokenId, uint256 _experience)
    public
    onlyOwner
  {
    require(hasRole(GAME_ROLE, msg.sender), "Does not have Game role");

    experience[_tokenId] += _experience;
    emit ExperienceGained(_tokenId, _experience, experience[_tokenId]);
  }

  function quest(uint256 _tokenId) external {
    require(_isApprovedOrOwner(msg.sender, _tokenId));
    require(
      block.timestamp > warriorsQuestLog[_tokenId],
      "Too early to do a new quest"
    );

    uint256 xpGained = randomFromString(
      string(abi.encodePacked("quest", toString(_tokenId))),
      xpPerQuest
    ) + xpPerQuest;

    warriorsQuestLog[_tokenId] = block.timestamp + DAY;
    experience[_tokenId] += xpGained;
    emit Quest(_tokenId, xpGained, experience[_tokenId]);
    emit ExperienceGained(_tokenId, xpGained, experience[_tokenId]);
  }

  function levelUp(uint256 _tokenId) external {
    require(
      _isApprovedOrOwner(msg.sender, _tokenId) ||
        hasRole(GAME_ROLE, msg.sender),
      "Does not have permission"
    );
    uint256 _level = warriors[_tokenId].level;
    require(_level <= maxLevelWarriors, "Max level reached");
    uint256 _xpRequired = experienceRequired(_level, 100);
    spendExperience(_tokenId, _xpRequired);

    warriors[_tokenId].level += 1;

    warriors[_tokenId].defense += 1;
    warriors[_tokenId].strength += 1;
    warriors[_tokenId].intelligence += 1;
    warriors[_tokenId].agility += 1;
    warriors[_tokenId].abilityPower += 1;
    warriors[_tokenId].magicResistance += 1;
    warriors[_tokenId].constitution += 1;
    warriors[_tokenId].speed += 1;

    emit LeveledUp(msg.sender, _tokenId, _level + 1);
  }

  // Increase the difficulty of leveling up
  // 100, 220, 360, 520, 700, 900
  function experienceRequired(uint256 _level, uint256 _xpPerLevel)
    public
    pure
    returns (uint256 xp_to_next_level)
  {
    xp_to_next_level = _level * _xpPerLevel;
    for (uint256 i = 1; i < _level; i++) {
      xp_to_next_level += _level * (_xpPerLevel / 10);
    }
  }

  // The following functions are overrides required by Solidity.

  function supportsInterface(bytes4 interfaceId)
    public
    view
    override(ERC721, ERC721Enumerable, AccessControl)
    returns (bool)
  {
    return super.supportsInterface(interfaceId);
  }

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
  ) internal override(ERC721, ERC721Enumerable) whenNotPaused {
    super._beforeTokenTransfer(from, to, tokenId);
  }

  // Utilities
  // Returns a random item from the list, always the same for the same token ID
  function pluck(
    uint256 tokenId,
    string memory keyPrefix,
    string[] memory sourceArray
  ) internal view returns (string memory) {
    uint256 rand = randomFromString(
      string(abi.encodePacked(keyPrefix, toString(tokenId))),
      sourceArray.length
    );

    return sourceArray[rand];
  }

  function randomFromString(string memory _salt, uint256 _limit)
    internal
    view
    returns (uint256)
  {
    return
      uint256(
        keccak256(abi.encodePacked(block.number, block.timestamp, _salt))
      ) % _limit;
  }

  function toString(uint256 value) internal pure returns (string memory) {
    // Inspired by OraclizeAPI's implementation - MIT license
    // https://github.com/oraclize/ethereum-api/blob/b42146b063c7d6ee1358846c198246239e9360e8/oraclizeAPI_0.4.25.sol

    if (value == 0) {
      return "0";
    }
    uint256 temp = value;
    uint256 digits;
    while (temp != 0) {
      digits++;
      temp /= 10;
    }
    bytes memory buffer = new bytes(digits);
    while (value != 0) {
      digits -= 1;
      buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
      value /= 10;
    }
    return string(buffer);
  }
}
