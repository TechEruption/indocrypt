# 7. Implementation and Evaluation

This section evaluates whether the implementation exhibits the semantic binding behavior defined by the model. The PoC is a validating implementation of the theoretical constructions; it does not introduce a signature scheme, blockchain, or oracle protocol.

## 7.1 Smart Contract Implementation

The implementation uses `SemanticOracleVerifier.sol`. An off-chain oracle signs a domain-separated digest using the standard Ethereum signed-message ECDSA convention. The verifier reconstructs the digest, recovers the signer, checks freshness, and compares the expected semantic context.

```mermaid
flowchart LR
  O[Oracle signer\nprivate key off-chain] --> D[Data + semantic context]
  D --> H[keccak256\nTAG || D || ctx]
  H --> S[Standard Ethereum\nECDSA signature]
  S --> V[SemanticOracleVerifier]
  V --> A{Signature valid?}
  A -- no --> R1[Reject: INVALID_SIGNATURE]
  A -- yes --> F{Epoch fresh?}
  F -- no --> R2[Reject: STALE_RESPONSE]
  F -- yes --> C{Expected context matches?}
  C -- no --> R3[Reject: CONSUMER_MISMATCH or REQUEST_MISMATCH]
  C -- yes --> R4[Accept]
```

The fixed-format `Response` contains `data`, `consumerId`, `requestId`, `epoch`, and `signature`. The authenticated context is selected by the binding profile:

- Broadcast: `TAG || D || Epoch`
- Consumer-Scoped: `TAG || D || ConsumerID || Epoch`
- Request-Scoped: `TAG || D || ConsumerID || RequestID || Epoch`

The contract also exposes field-selective verification functions used by the cost experiment: `verifyBroadcast`, `verifyConsumer`, and `verifyRequest`. These omit unused context fields from their ABI signatures. The original unified `verify` function remains available for the semantic control experiments.

A response is accepted only when the oracle signature is valid, the response is not older than the verifier's current epoch, and the fields required by the selected semantic class match the expected values. Group-Scoped is represented as a semantic enum value, but a complete group-membership mechanism is outside the core PoC scope.

## 7.2 Experimental Setup

| Item | Configuration |
|---|---|
| Test network | Local Hardhat EVM for reproducible tests and gas estimates |
| Deployed testnet contract | Sepolia address `0x104cCC8265b43D2180b3542B33d7651347B77329` |
| Solidity | `0.8.24` |
| Compiler target | Paris EVM target through Hardhat |
| Contract library | OpenZeppelin Contracts `5.0.2` |
| Development framework | Hardhat `2.29.1` |
| TypeScript | `5.9.3` |
| Runtime | Node.js `v24.13.0`, npm `11.6.2` |
| Frontend | React + Vite; separately built with `npm run build` |
| Remix | Not used; the repository uses Hardhat for reproducibility |
| Automated security tests | 8 passing tests |
| Gas experiment | 7 measured verification configurations |

The local experiment uses `D = 100`, `ConsumerID = 1`, `RequestID = 57`, and `Epoch = 15`. The oracle key is held by a test signer or an off-chain Sepolia signer and is never stored in the contract.

Reproduction commands:

```bash
npm install
npm test
npm run experiment
npm run build
```

The Sepolia measurement requires an RPC endpoint:

```powershell
$env:SEPOLIA_RPC_URL = "YOUR_SEPOLIA_RPC_URL"
$env:SEPOLIA_PRIVATE_KEY = "0xYOUR_ORACLE_PRIVATE_KEY"
npm run sepolia:metrics
```

## 7.3 Functional Validation

The automated suite maps directly to the security games and binding claims.

| Test | Expected | Observed |
|---|---|---|
| Valid broadcast response | Accept | Accept |
| Broadcast response used by another consumer | Accept | Accept |
| Valid consumer-scoped response | Accept | Accept |
| Consumer-scoped response sent to wrong consumer | Reject | Reject: `ConsumerMismatch` |
| Consumer-scoped response without ConsumerID binding | Attack succeeds in control | Attack reproduced |
| Request substitution without RequestID binding | Attack succeeds in control | Attack reproduced |
| Request substitution with RequestID binding | Reject | Reject: `RequestMismatch` |
| Stale response | Reject | Reject: `StaleResponse` |
| Modified data with original signature | Reject | Reject: `InvalidSignature` |
| Modified ConsumerID with original signature | Reject | Reject: `InvalidSignature` |
| Modified RequestID with original signature | Reject | Reject: `InvalidSignature` |
| Field-selective broadcast, consumer, and request paths | Accept valid values; reject wrong context | Passed |

The results demonstrate the distinction between authenticity and semantic validity. A genuine oracle signature is not sufficient when the epoch, consumer, or request context violates the verifier's policy.

## 7.4 Gas Cost Analysis

The experiment measures `estimateGas`, populated calldata size, and authenticated-context size. It evaluates both a fixed-format ABI and a selective ABI.

| Configuration | Encoding | Context bytes | Calldata bytes | Estimated gas |
|---|---:|---:|---:|---:|
| Broadcast minimal | Fixed | 96 | 516 | 33,884 |
| Broadcast over-bound | Fixed | 160 | 516 | 33,888 |
| Consumer-scoped | Fixed | 128 | 516 | 33,886 |
| Request-scoped | Fixed | 160 | 516 | 33,888 |
| Broadcast | Selective | 96 | 260 | 31,609 |
| Consumer-scoped | Selective | 128 | 324 | 32,413 |
| Request-scoped | Selective | 160 | 388 | 33,202 |

The fixed-format result is important: semantic minimality does not automatically imply smaller calldata when the ABI always carries all fields. In that format, the broadcast over-bound configuration adds only a small measured execution difference and no calldata difference.

The selective encoding gives the direct implementation-level comparison. Relative to selective broadcast, consumer binding adds 64 calldata bytes and 804 estimated gas in this run; request binding adds 128 calldata bytes and 1,593 estimated gas. These values are measurements of this compiler, contract, ABI, and execution environment, not universal constants.

The data therefore supports two separate conclusions:

1. ConsumerID and RequestID provide no additional cross-consumer or request security benefit for unrestricted broadcast semantics.
2. When a protocol omits semantically unnecessary fields from its encoding, minimal binding reduces serialized response size and the measured verification path cost.

## 7.5 Latency Analysis

The Sepolia script measures two latency values for each verification method:

- `rpcCallLatencyMs`: wall-clock time for the provider's `eth_call` response;
- `gasEstimateLatencyMs`: wall-clock time for the provider's gas-estimation response.

It measures `verify`, `verifyBroadcast`, `verifyConsumer`, and `verifyRequest`, and writes the result to `results/sepolia-metrics.json`.

These verifier methods are `view` functions. Consequently, they do not produce mined transactions, transaction receipts, confirmation latency, or actual paid transaction gas. The script reports estimated gas and RPC latency. A state-changing wrapper would be required to measure full submission-to-confirmation latency, but that would introduce behavior outside the current verifier model.

No Sepolia latency values are claimed in this section until `npm run sepolia:metrics` is run against the deployed address with a real RPC endpoint. This avoids fabricating network-dependent measurements. The expected relationship is that adding context can increase calldata and verification work, while observed network latency additionally depends on RPC load, geographic distance, provider routing, and block availability.

## 7.6 Experimental Results

The functional results reproduce the theorem-oriented behavior: broadcast responses remain transferable across consumers, while consumer-scoped and request-scoped responses are rejected when their required context is changed. Removing the required context in the control experiments reproduces the corresponding misuse attacks.

The cost results refine, rather than replace, the theoretical claim. Over-binding is not automatically expensive at the ABI level: the fixed-format interface transmits the same 516 bytes for every profile. However, when the implementation uses field-selective encoding, unnecessary context produces larger calldata and higher measured verification cost. Thus semantic minimality and ABI encoding cost are distinct properties, and the cost consequence depends on protocol serialization.

Taken together:

```text
Theoretical necessity
        +
Functional attack validation
        +
Encoding-dependent cost measurements
        ---------------------------------
Semantics-driven cryptographic context binding is experimentally supported
```

The results do not establish universal security or universal gas/latency penalties. They validate the stated misuse games under the stated threat model and quantify this PoC's implementation choices.
