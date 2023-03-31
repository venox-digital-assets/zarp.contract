import { ethers, upgrades, defender } from "hardhat";

// Upgrade deployment of ZARP on a chain. Deploys new implementation and submits upgrade proposal on defender

const UPGRADEABLE_ADDRESS = "0xb755506531786c8ac63b756bab1ac387bacb0c04"; // GOERLI address. Expecting same on mainnet at the moment
const ZARP_REPO_URL = "https://github.com/venox-digital-assets/zarp.contract";
const APPROVAL_ADDRESS = "0xfA4EB9AA068B3b64348f42b142E270f28E2f86EB";

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  console.log("Account balance:", (await deployer.getBalance()).toString());

  const token = await ethers.getContractFactory("Zarp");
  const proposal = await defender.proposeUpgrade(UPGRADEABLE_ADDRESS, token, {
    multisig: APPROVAL_ADDRESS,
  });
  console.log("Upgrade proposal created at:", proposal.url);
  const verification = await defender.verifyDeployment(
    UPGRADEABLE_ADDRESS,
    "ZarpV3",
    ZARP_REPO_URL
  );
  console.log(`Verified artifact with hash`, verification.providedSha256);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
