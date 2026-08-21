# Semantic-Aware Cryptographic Context Binding

A small validating PoC for the research paper **Semantic-Aware Cryptographic Context Binding for Blockchain Oracles**.

The PoC tests the claim that the required authenticated context depends on the intended sharing semantics of an oracle response:

```text
sharing semantics -> required context -> applicable misuse prevented -> minimality / overhead
```

## Research Objective

The implementation asks: given an oracle response's intended sharing semantics, what is the minimum context that must be authenticated to prevent misuse? It uses an established Ethereum-compatible ECDSA signature flow; the research contribution is the semantic classification and necessity comparison, not a new cryptographic primitive.

## Implemented Classes

- **Broadcast:** any consumer may use the response. The PoC binds `Epoch`; ConsumerID and RequestID are omitted for the minimal construction.
- **Group-Scoped:** represented in the Solidity enum as a semantic category. A complete group-membership construction and proof are outside this PoC's core scope.
- **Consumer-Scoped:** binds ConsumerID and Epoch. A response for Consumer A is rejected by Consumer B.
- **Request-Scoped:** binds ConsumerID, RequestID, and Epoch. A response for Q1 is rejected for Q2.

Freshness is independent of consumer/request authorization. This PoC rejects a response when its epoch is older than the verifier's current epoch.

## Threat Model

The attacker may observe, retain, replay, forward, and resubmit genuine responses, including across consumers and requests. The attacker cannot obtain the oracle private key or forge a valid signature. The tests therefore use genuine signatures and demonstrate cryptographic authenticity versus semantic invalidity.

## Cryptographic Context

The Solidity verifier hashes:

```text
keccak256(TAG || D || [ConsumerID] || [RequestID] || Epoch)
```

`TAG` is the fixed domain-separation value `SEMANTIC_ORACLE_RESPONSE_V1`. The oracle signs this digest using the standard Ethereum signed-message convention. The verifier separately checks signature validity, freshness, and expected context.

## Architecture

- `contracts/SemanticOracleVerifier.sol`: response digesting, OpenZeppelin ECDSA recovery, semantic and freshness checks, structured status values.
- `test/semanticOracle.test.ts`: valid flows, replay, cross-consumer misuse, request substitution, under-binding controls, tampering, and over-binding.
- `scripts/gasExperiment.ts`: executes each binding variant and writes actual gas/calldata measurements to `results/gas-results.json`.
- `frontend/`: Vite + React research-demo UI. It is a local interaction simulator of the same verification model.

The oracle private key is held by the Hardhat test signer/off-chain signer. It is never stored in a deployed contract.

## Installation

Requirements: Node.js 18+ and npm.

```bash
npm install
npm --prefix frontend install
```

## Tests

```bash
npm test
```

The suite covers:

1. valid broadcast response;
2. broadcast response used by another consumer;
3. valid consumer-scoped response;
4. wrong-consumer rejection;
5. valid request-scoped response;
6. request substitution rejection with RequestID binding;
7. stale response rejection;
8. modified data rejection;
9. modified ConsumerID rejection;
10. modified RequestID rejection;
11. technically verifiable over-bound broadcast response.

The under-binding controls explicitly show Consumer A -> B and Q1 -> Q2 being accepted when the corresponding field is omitted from the signed context.

## Gas Experiment

Run:

```bash
npm run experiment
```

This writes `results/gas-results.json` with actual `estimateGas` values, calldata bytes, and authenticated-context bytes. It compares two encodings:

- **Fixed:** the unified verifier always ABI-encodes ConsumerID and RequestID. This deliberately demonstrates that semantic minimality does not automatically reduce calldata: every fixed-format call is 516 bytes.
- **Selective:** separate `verifyBroadcast`, `verifyConsumer`, and `verifyRequest` entry points omit unused context fields from the ABI call. This measures the implementation cost of actually serializing only the required context.

The latest local run measured:

| Configuration | Encoding | Context bytes | Calldata bytes | Estimated gas |
|---|---:|---:|---:|---:|
| Broadcast minimal | Fixed | 96 | 516 | 33,884 |
| Broadcast over-bound | Fixed | 160 | 516 | 33,888 |
| Consumer-scoped | Fixed | 128 | 516 | 33,886 |
| Request-scoped | Fixed | 160 | 516 | 33,888 |
| Broadcast | Selective | 96 | 260 | 31,609 |
| Consumer-scoped | Selective | 128 | 324 | 32,413 |
| Request-scoped | Selective | 160 | 388 | 33,202 |

These numbers are execution results, not universal constants. The fixed-format result shows why ABI layout matters; the selective result demonstrates a concrete communication and verification-cost reduction when unused context is omitted. Regenerate the report whenever compiler or dependency versions change.

## UI

```bash
npm run ui
```

Open the Vite URL shown by the command. The UI lets you switch between Broadcast, Consumer-Scoped, and Request-Scoped modes and simulate valid verification, temporal replay, cross-consumer forwarding, and request substitution. Group-Scoped is intentionally limited to classification because its complete membership mechanism is outside the core implementation scope.

A production wallet or Sepolia deployment is not required for the validating PoC. A deployment script can be added later for a selected testnet signer and oracle address; private keys must remain off-chain.

The paper-ready implementation and evaluation write-up is available at [docs/section-7-implementation-evaluation.md](docs/section-7-implementation-evaluation.md).

For a local Hardhat deployment:

```bash
npx hardhat node
npm run deploy -- --network localhost
```

For Sepolia, configure the network and signer through the usual Hardhat environment variables before running the same deploy script. Never place an oracle private key in Solidity or source control.

## Sepolia Latency And Gas Metrics

The deployed Sepolia verifier is:

```text
0x104cCC8265b43D2180b3542B33d7651347B77329
```

Set an RPC endpoint and, for valid-signature estimates, the oracle signing key locally:

```powershell
$env:SEPOLIA_RPC_URL = "https://sepolia.infura.io/v3/YOUR_PROJECT_ID"
$env:SEPOLIA_PRIVATE_KEY = "0xYOUR_ORACLE_PRIVATE_KEY"
npm run sepolia:metrics
```

The private key is optional for read-only latency measurements, but without it the script uses an invalid placeholder signature and reports early invalid-signature gas paths. The configured key must correspond to the contract's `oracle()` address for valid verification-path estimates.

This command does **not** update `results/gas-results.json`; that file is the local Hardhat experiment. Sepolia output is written separately to `results/sepolia-metrics.json`. The Sepolia contract must be the build that contains `verifyBroadcast`, `verifyConsumer`, and `verifyRequest`. If the existing address was deployed before those functions were added, deploy the current contract and run with its address:

```powershell
$env:SEPOLIA_CONTRACT_ADDRESS = "0xCURRENT_DEPLOYED_ADDRESS"
npm run sepolia:metrics
```

The script measures `verify`, `verifyBroadcast`, `verifyConsumer`, and `verifyRequest`. Because these Solidity functions are `view`, Sepolia does not mine them as transactions: `estimateGas` is the execution-cost estimate, while `eth_call` latency is the RPC response latency. The result is written to `results/sepolia-metrics.json`. Actual mined transaction gas and confirmation latency cannot be measured for these methods unless a state-changing wrapper is added; adding one would change the current verifier semantics.

## Mapping To The Paper

| Paper section | PoC realization |
|---|---|
| System and threat model | `Response`, oracle signer, verifier, and genuine-response attacker tests |
| Response semantics | `SemanticClass` enum and UI mode selector |
| Security games | replay, forwarding, substitution, and tampering tests |
| Necessity / sufficiency | under-binding versus correct-binding tests |
| Implementation and evaluation | Solidity verifier, Hardhat suite, gas experiment, React UI |
| Discussion / limitations | Group-Scoped membership is classified but not fully formalized; results are limited to the stated attacks and assumptions |

## What This Project Does NOT Claim

- It does not introduce a new signature scheme, hash function, blockchain, consensus mechanism, or oracle network.
- It does not claim universal security.
- It does not claim ConsumerID is always required; it is required for cross-consumer protection under consumer-scoped semantics.
- It does not claim RequestID is required for every oracle; it is required when request correctness is part of the response semantics.
- It does not claim Epoch is always required; freshness is an independent security requirement.
- It does not provide a complete Group-Scoped formal treatment.
