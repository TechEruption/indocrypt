import { ethers } from 'hardhat';
import { mkdir, writeFile } from 'node:fs/promises';

async function main() {
  const [oracle] = await ethers.getSigners();
  const verifier = await ethers.deployContract('SemanticOracleVerifier', [oracle.address]);
  await verifier.waitForDeployment();

  const data = 100n;
  const epoch = 15n;
  const consumerId = 1n;
  const requestId = 57n;
  const sign = async (digest: string) => oracle.signMessage(ethers.getBytes(digest));
  const calldataBytes = (data: string) => (data.length - 2) / 2;
  const selective = async (label: string, fields: number, digest: string, estimate: (signature: string) => Promise<bigint>, populate: (signature: string) => Promise<{ data?: string }>) => {
    const signature = await sign(digest);
    const gasUsed = await estimate(signature);
    const populated = await populate(signature);
    return { label, encoding: 'selective', authenticatedContextBytes: fields * 32, gasUsed: gasUsed.toString(), calldataBytes: calldataBytes(populated.data!) };
  };
  const fixed = async (label: string, bindConsumer: boolean, bindRequest: boolean) => {
    const signature = await sign(await verifier.digest(data, consumerId, requestId, epoch, bindConsumer, bindRequest));
    const response = { data, consumerId, requestId, epoch, signature };
    const gasUsed = await verifier.verify.estimateGas(response, 0, consumerId, requestId, epoch, bindConsumer, bindRequest);
    const populated = await verifier.verify.populateTransaction(response, 0, consumerId, requestId, epoch, bindConsumer, bindRequest);
    return { label, encoding: 'fixed', authenticatedContextBytes: 96 + (bindConsumer ? 32 : 0) + (bindRequest ? 32 : 0), gasUsed: gasUsed.toString(), calldataBytes: calldataBytes(populated.data!) };
  };

  const results = [
    await fixed('broadcast-minimal', false, false),
    await fixed('broadcast-over-bound', true, true),
    await fixed('consumer-scoped-correct', true, false),
    await fixed('request-scoped-correct', true, true),
    await selective('broadcast-selective', 3, await verifier.broadcastDigest(data, epoch), (signature) => verifier.verifyBroadcast.estimateGas(data, epoch, signature, epoch), (signature) => verifier.verifyBroadcast.populateTransaction(data, epoch, signature, epoch)),
    await selective('consumer-selective', 4, await verifier.consumerDigest(data, consumerId, epoch), (signature) => verifier.verifyConsumer.estimateGas(data, consumerId, epoch, signature, consumerId, epoch), (signature) => verifier.verifyConsumer.populateTransaction(data, consumerId, epoch, signature, consumerId, epoch)),
    await selective('request-selective', 5, await verifier.requestDigest(data, consumerId, requestId, epoch), (signature) => verifier.verifyRequest.estimateGas(data, consumerId, requestId, epoch, signature, consumerId, requestId, epoch), (signature) => verifier.verifyRequest.populateTransaction(data, consumerId, requestId, epoch, signature, consumerId, requestId, epoch))
  ];
  await mkdir('results', { recursive: true });
  await writeFile('results/gas-results.json', JSON.stringify(results, null, 2));
  console.table(results);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
