import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";
import keccak256 from "keccak256";
import Sinon from "sinon";
import { generateMerkle } from "./generateMerkletree";
import allwhitelist from './whitelist.json';
const OWNABLE_MSG = "Ownable: caller is not the owner";

describe("DefiHeroes", function () {
  let contract: Contract;
  let owner: SignerWithAddress;
  let address1: SignerWithAddress;
  let address2: SignerWithAddress;
  let address3: SignerWithAddress;


  beforeEach(async () => {
    const ContractFactory = await ethers.getContractFactory("DefiHeroes");
    [owner, address1, address2, address3] = await ethers.getSigners();
    contract = await ContractFactory.deploy("https://baseUri/", 10000);
  });

  // Correct deployment
  it("Should initialize contract with name, symbol, baseUri and token counter", async () => {
    expect(await contract.symbol()).to.equal("DEFIHEROES");
    expect(await contract.name()).to.equal("DefiHeroes");
    expect(await contract.getCurrentTokenId()).to.equal(1);
    // mint a token and get tokenUri
    await contract.connect(owner).ownerMint(1, owner.address, { value: 0 });
    expect(await contract.connect(owner).tokenURI(1)).to.be.equal(
      "https://baseUri/1"
    );
  });

  // Ownership
  it("Should set the right owner", async () => {
    expect(await contract.owner()).to.equal(await owner.address);
  });

  it("Should has the right price after being deployed", async () => {
    const price = await contract.price();
    const formatedPrice = ethers.utils.formatEther(price);
    expect(formatedPrice).to.equal("0.0");
  });

  it("Should set the price correctly", async () => {
    await contract.setPublicPrice(BigNumber.from("70000000000000000"));
    const price = await contract.price();
    const formatedPrice = ethers.utils.formatEther(price);
    expect(formatedPrice).to.equal("0.07");
    await expect(
      contract
        .connect(address1)
        .setPublicPrice(BigNumber.from("40000000000000000"))
    ).to.be.revertedWith(OWNABLE_MSG);
  });

  it("Should allow owner to widthdraw", async () => {
    // Address 1 mints token 1 to send some eth to the contract
    // NOTE: Any ideas about how to send funds to the contract?
    await contract.setPublicPrice(BigNumber.from("50000000000000000"));
    const price = await contract.price();
    contract.connect(address1).mint({ value: price });

    // owner should have more eth after withdrawal
    const balancePreWithdrawal = await owner.getBalance();
    await contract.connect(owner).ownerWithdraw();
    const balancePostWithdrawal = await owner.getBalance();
    expect(balancePostWithdrawal).to.be.gt(balancePreWithdrawal);
    const estimatedBalanceAfterGas = balancePreWithdrawal
      .add(price)
      .sub(BigNumber.from(2300).mul(await contract.provider.getGasPrice()));
    const diffError = estimatedBalanceAfterGas.sub(balancePostWithdrawal).abs();
    const acceptedError = BigNumber.from("50000000000000"); // 0,00005 eth

    expect(diffError).to.be.lt(acceptedError);
  });

  it("Should not allow non-owner to widthdraw", async () => {
    await expect(contract.connect(address1).ownerWithdraw()).to.be.revertedWith(
      OWNABLE_MSG
    );
  });

  // Base URI
  it("Should allow owner to set baseURI", async () => {
    const newBaseUri = "new_base_uri";
    const tokenId = await contract.getCurrentTokenId();
    // Address 1 mints token 1 to be able to form tokenURI
    const price = await contract.price();
    contract.connect(address1).mint({ value: price });
    await contract.connect(owner).setBaseURI(newBaseUri);
    expect(await contract.connect(owner).tokenURI(1)).to.be.equal(
      `${newBaseUri}${tokenId}`
    );
  });

  it("Should not allow non-owner to set baseURI", async () => {
    await expect(contract.connect(address1).setBaseURI("")).to.be.revertedWith(
      OWNABLE_MSG
    );
  });

  // MINTING
  it("Rejects whitelist mint if whitelist is not active", async () => {
    const merkle = generateMerkle([address1.address, ...allwhitelist]);
    const hexProof = merkle.getHexProof(address1.address);
    await expect(
      contract.connect(address1).whiteListMint(hexProof)
    ).to.be.revertedWith("WhiteList mint is not active");
  });

  it("Disables normal mint meanwhile whitelist is active", async () => {
    await contract.connect(owner).setWhiteListActive(true);
    const price = await contract.priceMultiple();

    await expect(
      contract.connect(address1).mint({ value: price })
    ).to.be.revertedWith("Whitelist mint is active");

    const numTokens = 2;

    await expect(
      contract
        .connect(address1)
        .mintMultiple(numTokens, { value: price.mul(numTokens) })
    ).to.be.revertedWith("Whitelist mint is active");
  });

  it("Disables whitelist, allows to resume normal mint", async () => {
    await contract.connect(owner).setWhiteListActive(true);
    await contract.connect(owner).setWhiteListActive(false);

    const price = await contract.price();
    await contract.connect(address1).mint({ value: price });
    expect(await contract.connect(owner).ownerOf(1)).to.be.equal(
      address1.address
    );
  });

  it("Allows whitelisted addresses to mint", async () => {
    console.log(allwhitelist[1])
    const newWL = [address1.address, ...allwhitelist]
    console.log(newWL.length)
    const merkle = generateMerkle(newWL);
    const rootHash = merkle.getRoot();
    const hexProof = merkle.getHexProof(keccak256(address1.address));

    // sets the merkle root
    await contract.connect(owner).setMerkleRoot(rootHash);
    await contract.connect(owner).setWhiteListActive(true);

    // Reverts not whitelisted address
    const hexProof2 = merkle.getHexProof(address2.address);

    await expect(
      contract.connect(address2).whiteListMint(hexProof2)
    ).to.be.revertedWith("Invalid proof");

    // mints 2 correctly
    await contract.connect(address1).whiteListMint(hexProof);
    expect(await contract.connect(owner).ownerOf(1)).to.be.equal(
      address1.address
    );

    expect(await contract.connect(owner).ownerOf(2)).to.be.equal(
      address1.address
    );

    // Only mint 2 in whitelist
    await expect(contract.connect(owner).ownerOf(3)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );

    await expect(
      contract.connect(address1).whiteListMint(hexProof)
    ).to.be.revertedWith("Address already claimed");
  });

  it("Should allow owner to safe mint", async () => {
    const tokenId = await contract.getCurrentTokenId();
    await contract.connect(owner).ownerMint(1, address1.address);
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      address1.address
    );
    expect(await contract.connect(owner).ownerOf(tokenId)).to.not.be.equal(
      owner.address
    );
  });

  it("Should increase counter after owner safe mint", async () => {
    await contract.connect(owner).ownerMint(1, address1.address);

    expect(await contract.connect(owner).getCurrentTokenId()).to.be.equal(2);
  });

  it("Should revert if non-owner try to owner mint", async () => {
    await expect(
      contract.connect(address1).ownerMint(1, address2.address)
    ).to.be.revertedWith(OWNABLE_MSG);
  });

  it("Should not increase token counter if reverted", async () => {
    const tokenIdBeforeMintAttempt = await contract.getCurrentTokenId();
    await expect(
      contract.connect(address1).ownerMint(1, address2.address)
    ).to.be.revertedWith(OWNABLE_MSG);
    expect(tokenIdBeforeMintAttempt).to.be.equal(
      await contract.getCurrentTokenId()
    );
  });

  it("Should mint available token", async () => {
    // should mint
    const tokenId = await contract.getCurrentTokenId();
    const price = await contract.price();
    await contract.connect(address1).mint({ value: price });
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      address1.address
    );
  });

  it("Should increase counter after mint available token", async () => {
    const price = await contract.price();
    await contract.connect(address1).mint({ value: price });
    expect(await contract.connect(owner).getCurrentTokenId()).to.be.equal(2);
  });

  it("Should emit Transfer and NFTCreated event after minting available token", async () => {
    // should emit Event
    const tokenId = await contract.getCurrentTokenId();
    const price = await contract.price();
    await expect(await contract.connect(address1).mint({ value: price }))
      .to.emit(contract, "Transfer")
      .withArgs(ethers.constants.AddressZero, address1.address, tokenId)
      .to.emit(contract, "NFTCreated")
      .withArgs(tokenId);
  });

  it("Should emit Transfer and NFTCreated event after owner safe mint available token", async () => {
    // should emit Event
    const tokenId = await contract.getCurrentTokenId();
    await expect(
      await contract.connect(owner).ownerMint(1, address1.address, { value: 0 })
    )
      .to.emit(contract, "Transfer")
      .withArgs(ethers.constants.AddressZero, address1.address, tokenId)
      .to.emit(contract, "NFTCreated")
      .withArgs(tokenId);
  });

  it("Should let mint without funds", async () => {
    const funds = 0;

    await expect(
      contract.connect(address1).mint({ value: funds })
    ).not.to.be.revertedWith("Ether value sent is not correct");
  });

  it("Should mint when sending more funds than needed", async () => {
    const tokenId = await contract.getCurrentTokenId();
    const price = await contract.price();
    const biggerFunds = BigNumber.from(price).add(BigNumber.from(price));

    await expect(contract.connect(address1).mint({ value: biggerFunds })).to.not
      .be.reverted;
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      address1.address
    );
  });

  it("Should let owner mint free", async () => {
    // balance after should be greater than prevBalance minus price (check gas)
    const tokenId = await contract.getCurrentTokenId();

    await expect(
      contract.connect(owner).ownerMint(1, owner.address, { value: 0 })
    ).to.not.be.reverted;
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      owner.address
    );
  });

  it("Should emit after owner claim multiple", async () => {
    await expect(
      contract.connect(owner).ownerMint(3, owner.address, { value: 0 })
    )
      .to.emit(contract, "NFTCreated")
      .withArgs(1)
      .to.emit(contract, "NFTCreated")
      .withArgs(2)
      .to.emit(contract, "NFTCreated")
      .withArgs(3);

    expect(await contract.connect(owner).ownerOf(3)).to.be.equal(owner.address);
    await expect(contract.connect(owner).ownerOf(4)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
  });

  it("Should increase counter after owner claim multiple available tokens", async () => {
    await contract.connect(owner).ownerMint(3, owner.address, { value: 0 });
    expect(await contract.connect(owner).getCurrentTokenId()).to.be.equal(4);
  });

  it("Should let owner mint free for someone else", async () => {
    // balance after should be greater than prevBalance minus price (check gas)
    const tokenId = await contract.getCurrentTokenId();

    await expect(
      contract.connect(owner).ownerMint(1, address1.address, { value: 0 })
    ).to.not.be.reverted;

    // expect address 1 has token
    expect(await contract.connect(owner).ownerOf(tokenId)).to.be.equal(
      address1.address
    );
    expect(await contract.connect(owner).ownerOf(tokenId)).to.not.be.equal(
      owner.address
    );
  });

  it("Should not let non-owner claim tokens", async () => {
    await expect(
      contract.connect(address1).ownerMint(1, address1.address, { value: 0 })
    ).to.be.revertedWith(OWNABLE_MSG);
  });

  it("Should let user mint N < maxAllowed tokens", async () => {
    const price = await contract.priceMultiple();
    const numTokens = 2;

    await contract
      .connect(address3)
      .mintMultiple(numTokens, { value: price.mul(numTokens) });
    expect(await contract.getCurrentTokenId()).to.be.equal(BigNumber.from(3));
    // expect token 1 and 20 belongs to address3
    expect(await contract.connect(owner).ownerOf(1)).to.be.equal(
      address3.address
    );
    expect(await contract.connect(owner).ownerOf(2)).to.be.equal(
      address3.address
    );
    // expect token 3 doesn't exist
    await expect(contract.connect(owner).ownerOf(3)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
  });

  it("Should emit events correctly", async function () {
    const result = await contract.connect(address1).mint();

    expect(result).to.emit(contract, "Transfer");
    expect(result).to.emit(contract, "WarriorCreated");

    const receipt = await result.wait();

    const createdEvent = receipt.events.find(
      (i: any) => i.event === "WarriorCreated"
    );

    expect(createdEvent.args[0]).to.equal(1);
    console.log(createdEvent.args[1]);
  });

  // it("Should emit after user mint multiple", async () => {
  //   const price = await contract.price();
  //   const num = 2;
  //   await expect(
  //     contract.connect(address1).mintMultiple(num, { value: price.mul(num) })
  //   )
  //     .to.emit(contract, "WarriorCreated")
  //     .withArgs(1, {
  //       strength: Sinon.match.number,
  //       agility: Sinon.match.number,
  //       defense: Sinon.match.number,
  //       intelligence: Sinon.match.number,
  //       abilityPower: Sinon.match.number,
  //       magicResistance: Sinon.match.number,
  //       constitution: Sinon.match.number,
  //       level: 1,
  //     })
  //     .to.emit(contract, "WarriorCreated")
  //     .withArgs(2, {
  //       strength: Sinon.match.number,
  //       agility: Sinon.match.number,
  //       defense: Sinon.match.number,
  //       intelligence: Sinon.match.number,
  //       abilityPower: Sinon.match.number,
  //       magicResistance: Sinon.match.number,
  //       constitution: Sinon.match.number,
  //       level: 1,
  //     })
  //     .to.emit(contract, "WarriorCreated")
  //     .withArgs(3, {
  //       strength: Sinon.match.number,
  //       agility: Sinon.match.number,
  //       defense: Sinon.match.number,
  //       intelligence: Sinon.match.number,
  //       abilityPower: Sinon.match.number,
  //       magicResistance: Sinon.match.number,
  //       constitution: Sinon.match.number,
  //       level: 1,
  //     });

  //   expect(await contract.connect(owner).ownerOf(2)).to.be.equal(
  //     address1.address
  //   );
  //   await expect(contract.connect(owner).ownerOf(3)).to.be.revertedWith(
  //     "ERC721: owner query for nonexistent token"
  //   );
  // });

  it("Should increase counter after user mint multiple", async () => {
    const price = await contract.priceMultiple();
    const num = 2;
    await contract
      .connect(address1)
      .mintMultiple(num, { value: price.mul(num) });

    expect(await contract.getCurrentTokenId()).to.be.equal(BigNumber.from(3));
  });

  // it("Should not let mint multiple in not funds", async () => {
  //   const price = await contract.price();
  //   const num = 3;
  //   await expect(
  //     contract
  //       .connect(address1)
  //       .mintMultiple(num, { value: price.mul(num - 1) })
  //   ).to.be.revertedWith("Ether sent is not enough");
  // });

  it("Should not let user mint N > maxAllowed tokens", async () => {
    const price = await contract.priceMultiple();
    const numTokens = 8;

    await expect(
      contract
        .connect(address1)
        .mintMultiple(numTokens, { value: price.mul(numTokens) })
    ).to.be.revertedWith("You can mint a max of 5 tokens");
  });

  it("Should not let user mint multiple with 0 or less tokens", async () => {
    const price = await contract.priceMultiple();
    const numTokens = 0;
    const negativeNumTokens = -10;

    await expect(
      contract
        .connect(address1)
        .mintMultiple(numTokens, { value: price.mul(numTokens) })
    ).to.be.revertedWith("The minimum is one token");

    await expect(
      contract.connect(address1).mintMultiple(negativeNumTokens, {
        value: price.mul(10),
      })
    ).to.be.reverted;
  });

  it("Should not mint if paused", async () => {
    const price = await contract.price();
    await contract.connect(owner).pause();
    await expect(
      contract.connect(address1).mint({ value: price })
    ).to.be.revertedWith("Pausable: paused");
  });

  it("Should not mint multiple if paused", async () => {
    const price = await contract.priceMultiple();
    const num = 2;
    await contract.connect(owner).pause();
    await expect(
      contract.connect(address1).mintMultiple(num, { value: price.mul(num) })
    ).to.be.revertedWith("Pausable: paused");
  });

  it("Should not let owner claim beyond the 10000 tokens limit", async () => {
    const num = 10001;
    await expect(
      contract.connect(owner).ownerMint(num, owner.address, { value: 0 })
    ).to.be.revertedWith("Exceeds maximum supply");
  });

  it("Should let owner claim 10000 tokens limit", async () => {
    const num = 10000;
    await expect(
      contract.connect(owner).ownerMint(num, owner.address, { value: 0 })
    )
      .to.not.be.revertedWith("Exceeds maximum supply")
      .to.be.revertedWith(
        "TransactionExecutionError: Transaction ran out of gas"
      );
  });

  it("Should not let owner claim multiple with 0 or less tokens", async () => {
    const numTokens = 0;
    const negativeNumTokens = -10;

    await expect(
      contract.connect(owner).ownerMint(numTokens, owner.address, { value: 0 })
    ).to.be.revertedWith("The minimum is one token");

    await expect(
      contract.connect(owner).ownerMint(negativeNumTokens, owner.address, {
        value: 0,
      })
    ).to.be.reverted;
  });

  it("Should increase contract balance after mint", async () => {
    await contract.setPublicPrice(BigNumber.from("50000000000000000"));

    const price = await contract.price();

    const balancePreMint = await contract.provider.getBalance(contract.address);
    expect(balancePreMint).to.equal(0);

    await contract.connect(address1).mint({ value: price });
    const balancePostMint = await contract.provider.getBalance(
      contract.address
    );

    expect(balancePostMint).to.equal(BigNumber.from("50000000000000000"));
  });

  it("Should increase contract balance after mint multiple", async () => {

    const price = await contract.priceMultiple();
    const num = 2;

    const balancePreMint = await contract.provider.getBalance(contract.address);
    expect(balancePreMint).to.equal(0);

    await contract
      .connect(address1)
      .mintMultiple(num, { value: price.mul(num) });
    const balancePostMint = await contract.provider.getBalance(
      contract.address
    );

    expect(balancePostMint).to.equal(BigNumber.from("20000000000000000"));
  });

  it("Should not mint more than maxSupply", async () => {
    const factory = await ethers.getContractFactory("DefiHeroes");
    const contractLimit = await factory.deploy("https://baseUri/", 2);
    const price = await contractLimit.priceMultiple();

    await expect(
      contractLimit.connect(address1).mintMultiple(3, { value: price })
    ).to.be.revertedWith("Exceeds maximum supply");
    expect(await contractLimit.getCurrentTokenId()).to.equal(1);
    await expect(contractLimit.connect(owner).ownerOf(4)).to.be.revertedWith(
      "ERC721: owner query for nonexistent token"
    );
  });

  it("Should not mint multiple more than maxSupply", async () => {
    const Factory = await ethers.getContractFactory("DefiHeroes");
    const max = 1;
    const contractLimit = await Factory.deploy("https://baseUri/", max);
    const price = await contractLimit.priceMultiple();

    await expect(
      contractLimit.connect(address1).mintMultiple(2, { value: price })
    ).to.be.revertedWith("Exceeds maximum supply");
    await expect(
      contractLimit
        .connect(address1)
        .mintMultiple(max, { value: price.mul(max) })
    ).to.not.be.reverted;
    expect(await contractLimit.getCurrentTokenId()).to.equal(2);
  });

  it("Should have correct attributes", async () => {
    await contract.connect(owner).ownerMint(10, address1.address);
    const warrior = await contract.warriors(1);

    console.log(JSON.stringify(warrior));

    expect(warrior.strength.toNumber()).to.be.greaterThanOrEqual(0);
    expect(warrior.strength.toNumber()).to.be.lessThanOrEqual(12);

    expect(warrior.defense.toNumber()).to.be.greaterThanOrEqual(0);
    expect(warrior.defense.toNumber()).to.be.lessThanOrEqual(12);

    expect(warrior.intelligence.toNumber()).to.be.greaterThanOrEqual(0);
    expect(warrior.intelligence.toNumber()).to.be.lessThanOrEqual(12);

    expect(warrior.abilityPower.toNumber()).to.be.greaterThanOrEqual(0);
    expect(warrior.abilityPower.toNumber()).to.be.lessThanOrEqual(12);

    expect(warrior.constitution.toNumber()).to.be.greaterThanOrEqual(0);
    expect(warrior.constitution.toNumber()).to.be.lessThanOrEqual(12);

    expect(warrior.magicResistance.toNumber()).to.be.greaterThanOrEqual(0);
    expect(warrior.magicResistance.toNumber()).to.be.lessThanOrEqual(12);

    expect(warrior.speed.toNumber()).to.be.greaterThanOrEqual(0);
    expect(warrior.speed.toNumber()).to.be.lessThanOrEqual(12);

    expect(warrior.agility.toNumber()).to.be.greaterThanOrEqual(0);
    expect(warrior.agility.toNumber()).to.be.lessThanOrEqual(12);

    expect(warrior.level.toNumber()).to.be.eq(1);
  });

  it("Can do a quest", async function () {
    await contract.connect(owner).mint();

    const exp = await contract.experience(1);
    expect(exp.toNumber()).to.eq(0);

    const result = await contract.quest(1);
    expect(result).to.emit(contract, "Quest");

    const receipt = await result.wait();

    const questEvent = receipt.events.find((i: any) => i.event === "Quest");

    expect(questEvent.args[0]).to.equal(1);
    expect(questEvent.args[1].toNumber()).to.be.greaterThan(100);
    expect(questEvent.args[2].toNumber()).to.be.greaterThan(100);
    const expNew = await contract.experience(1);
    expect(expNew.toNumber()).to.eq(questEvent.args[2].toNumber());

    // To eearly for new quest
    expect(contract.quest(1)).to.be.revertedWith("Too early to do a new quest");
  });

  it("Can level up", async function () {
    await contract.connect(owner).mint();
    await contract.quest(1);

    const exp = await contract.experience(1);
    expect(exp.toNumber()).to.be.greaterThan(0);
    const warrior = await contract.warriors(1);

    const result = await contract.levelUp(1);
    expect(result).to.emit(contract, "ExperienceSpent");
    expect(result).to.emit(contract, "LeveledUp");
    const receipt = await result.wait();

    const leveledUpEvent = receipt.events.find(
      (i: any) => i.event === "LeveledUp"
    );
    const experienceSpentEvent = receipt.events.find(
      (i: any) => i.event === "ExperienceSpent"
    );

    expect(experienceSpentEvent.args[0]).to.equal(1);
    expect(experienceSpentEvent.args[1].toNumber()).to.equal(100);
    expect(experienceSpentEvent.args[2].toNumber()).to.equal(
      exp.toNumber() - 100
    );

    expect(leveledUpEvent.args[1]).to.equal(1);
    expect(leveledUpEvent.args[2]).to.equal(2);

    const expNew = await contract.experience(1);
    expect(expNew.toNumber()).to.eq(experienceSpentEvent.args[2].toNumber());

    const genNew = await contract.warriors(1);

    expect(genNew.strength.toNumber()).to.be.eq(
      warrior.strength.toNumber() + 1
    );
    expect(genNew.defense.toNumber()).to.be.eq(warrior.defense.toNumber() + 1);
    expect(genNew.intelligence.toNumber()).to.be.eq(
      warrior.intelligence.toNumber() + 1
    );
    expect(genNew.agility.toNumber()).to.be.eq(warrior.agility.toNumber() + 1);
    expect(genNew.abilityPower.toNumber()).to.be.eq(
      warrior.abilityPower.toNumber() + 1
    );
    expect(genNew.magicResistance.toNumber()).to.be.eq(
      warrior.magicResistance.toNumber() + 1
    );
    expect(genNew.constitution.toNumber()).to.be.eq(
      warrior.constitution.toNumber() + 1
    );
    expect(genNew.speed.toNumber()).to.be.eq(warrior.speed.toNumber() + 1);

    expect(genNew.level.toNumber()).to.be.eq(2);
  });

  it("Can not do a level up again", async function () {
    await contract.connect(owner).mint();

    expect(contract.levelUp(1)).to.be.revertedWith("Not enough experience");
  });
});
