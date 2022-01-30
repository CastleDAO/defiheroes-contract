// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { ethers } from "hardhat";
import { generateMerkle } from "../test/generateMerkletree";
import allwhitelist from "../test/whitelist.json";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const Factory = await ethers.getContractFactory("DefiHeroes");
  const contract = await Factory.deploy("https://baseUri/", 4000);

  await contract.deployed();

  const network = await ethers.provider.getNetwork();
  const networkName = network.name === "unknown" ? "localhost" : network.name;

  console.log("Contract deployed to:", contract.address);
  if (networkName !== "localhost") {
    console.log("");
    console.log("To verify this contract on Etherscan, try:");
    console.log(
      `npx hardhat verify --network ${networkName} ${contract.address} "https://baseUri/" 4000`
    );
  }

  const merkle = generateMerkle(allwhitelist);
  const rootHash = merkle.getRoot();

  await contract.setMerkleRoot(rootHash);
  console.log("merkle root set");
  await contract.setWhiteListActive(true);
  console.log("Whitelist mint enabled");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
