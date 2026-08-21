import { artifacts, ethers } from 'hardhat';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const CONTRACT_ADDRESS = process.env.SEPOLIA_CONTRACT_ADDRESS || '0x104cCC8265b43D2180b3542B33d7651347B77329';
const DATA = 100n;
const CONSUMER_ID = 1n;
const REQUEST_ID = 57n;
const EPOCH = 15n;

type Metric = {
  method: string;
  status: string;
  estimateGas?: string;
  calldataBytes: number;
  rpcCallLatencyMs: number;
  gasEstimateLatencyMs?: number;
  gasPriceWei?: string;
  estimatedCostWei?: string;
  note?: string;
};

function elapsed(start: number): number {
  return Number((performance.now() - start).toFixed(2));
}

async function main() {
  if (!process.env.SEPOLIA_RPC_URL) {
    throw new Error('Set SEPOLIA_RPC_URL before running npm run sepolia:metrics.');
  }

  const artifact = await artifacts.readArtifact('SemanticOracleVerifier');
  const provider = ethers.provider;
  const contract = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, provider);
  const network = await provider.getNetwork();
  const code = await provider.getCode(CONTRACT_ADDRESS);
  if (code === '0x') throw new Error(`No contract code found at ${CONTRACT_ADDRESS}.`);
  const oracleAddress = await contract.oracle();
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
  const configuredSigner = process.env.SEPOLIA_PRIVATE_KEY
    ? new ethers.Wallet(process.env.SEPOLIA_PRIVATE_KEY)
    : undefined;
  const signerMatches = configuredSigner && configuredSigner.address.toLowerCase() === oracleAddress.toLowerCase();
  const signer = signerMatches ? configuredSigner : undefined;
  const signatureFor = async (digest: string) => signer
    ? signer.signMessage(ethers.getBytes(digest))
    : '0x' + '00'.repeat(65);

  const metrics: Metric[] = [];
  const measure = async (
    method: string,
    call: () => Promise<unknown>,
    populate: () => Promise<{ data?: string }>,
    estimate?: () => Promise<bigint>
  ) => {
    const callStart = performance.now();
    const value = await call();
    const rpcCallLatencyMs = elapsed(callStart);
    const tx = await populate();
    const metric: Metric = {
      method,
      status: String(value),
      calldataBytes: ((tx.data?.length ?? 2) - 2) / 2,
      rpcCallLatencyMs
    };
    if (estimate) {
      const estimateStart = performance.now();
      const gas = await estimate();
      metric.estimateGas = gas.toString();
      metric.gasEstimateLatencyMs = elapsed(estimateStart);
      if (gasPrice) {
        metric.gasPriceWei = gasPrice.toString();
        metric.estimatedCostWei = (gas * gasPrice).toString();
      }
    }
    metrics.push(metric);
  };

  const fixedDigest = await contract.digest(DATA, CONSUMER_ID, REQUEST_ID, EPOCH, true, true);
  const fixedSignature = await signatureFor(fixedDigest);
  const fixedResponse = { data: DATA, consumerId: CONSUMER_ID, requestId: REQUEST_ID, epoch: EPOCH, signature: fixedSignature };
  await measure(
    'verify-fixed-request',
    () => contract.verify.staticCall(fixedResponse, 3, CONSUMER_ID, REQUEST_ID, EPOCH, true, true),
    () => contract.verify.populateTransaction(fixedResponse, 3, CONSUMER_ID, REQUEST_ID, EPOCH, true, true),
    () => contract.verify.estimateGas(fixedResponse, 3, CONSUMER_ID, REQUEST_ID, EPOCH, true, true)
  );

  const broadcastSignature = await signatureFor(await contract.broadcastDigest(DATA, EPOCH));
  await measure(
    'verifyBroadcast-selective',
    () => contract.verifyBroadcast.staticCall(DATA, EPOCH, broadcastSignature, EPOCH),
    () => contract.verifyBroadcast.populateTransaction(DATA, EPOCH, broadcastSignature, EPOCH),
    () => contract.verifyBroadcast.estimateGas(DATA, EPOCH, broadcastSignature, EPOCH)
  );

  const consumerSignature = await signatureFor(await contract.consumerDigest(DATA, CONSUMER_ID, EPOCH));
  await measure(
    'verifyConsumer-selective',
    () => contract.verifyConsumer.staticCall(DATA, CONSUMER_ID, EPOCH, consumerSignature, CONSUMER_ID, EPOCH),
    () => contract.verifyConsumer.populateTransaction(DATA, CONSUMER_ID, EPOCH, consumerSignature, CONSUMER_ID, EPOCH),
    () => contract.verifyConsumer.estimateGas(DATA, CONSUMER_ID, EPOCH, consumerSignature, CONSUMER_ID, EPOCH)
  );

  const requestSignature = await signatureFor(await contract.requestDigest(DATA, CONSUMER_ID, REQUEST_ID, EPOCH));
  await measure(
    'verifyRequest-selective',
    () => contract.verifyRequest.staticCall(DATA, CONSUMER_ID, REQUEST_ID, EPOCH, requestSignature, CONSUMER_ID, REQUEST_ID, EPOCH),
    () => contract.verifyRequest.populateTransaction(DATA, CONSUMER_ID, REQUEST_ID, EPOCH, requestSignature, CONSUMER_ID, REQUEST_ID, EPOCH),
    () => contract.verifyRequest.estimateGas(DATA, CONSUMER_ID, REQUEST_ID, EPOCH, requestSignature, CONSUMER_ID, REQUEST_ID, EPOCH)
  );

  const report = {
    network: { chainId: network.chainId.toString(), contractAddress: CONTRACT_ADDRESS, oracleAddress, blockNumber: await provider.getBlockNumber() },
    measurement: { timestamp: new Date().toISOString(), gasIsEstimated: true, viewFunctionsHaveNoMinedReceipt: true, validOracleSignatureAvailable: Boolean(signer) },
    metrics
  };
  await mkdir('results', { recursive: true });
  await writeFile('results/sepolia-metrics.json', JSON.stringify(report, null, 2));
  console.log('Wrote Sepolia metrics to results/sepolia-metrics.json');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
