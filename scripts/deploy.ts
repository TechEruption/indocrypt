import { ethers } from 'hardhat';

async function main() {
  const [oracle] = await ethers.getSigners();
  const verifier = await ethers.deployContract('SemanticOracleVerifier', [oracle.address]);
  await verifier.waitForDeployment();
  console.log(`Oracle signer: ${oracle.address}`);
  console.log(`SemanticOracleVerifier: ${await verifier.getAddress()}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
