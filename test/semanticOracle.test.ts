import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SemanticOracleVerifier } from '../typechain-types';

describe('SemanticOracleVerifier', function () {
  let verifier: SemanticOracleVerifier;
  let oracle: any;
  const data = 100n;
  const consumerA = 1n;
  const consumerB = 2n;
  const request1 = 57n;
  const request2 = 58n;
  const epoch = 15n;

  enum SemanticClass { Broadcast, GroupScoped, ConsumerScoped, RequestScoped }
  enum Status { Accepted, InvalidSignature, StaleResponse, ConsumerMismatch, RequestMismatch }

  async function response(consumerId = consumerA, requestId = request1, responseEpoch = epoch, bindConsumer = false, bindRequest = false) {
    const digest = await verifier.digest(data, consumerId, requestId, responseEpoch, bindConsumer, bindRequest);
    return { data, consumerId, requestId, epoch: responseEpoch, signature: await oracle.signMessage(ethers.getBytes(digest)) };
  }

  beforeEach(async function () {
    [oracle] = await ethers.getSigners();
    verifier = await ethers.deployContract('SemanticOracleVerifier', [oracle.address]) as unknown as SemanticOracleVerifier;
    await verifier.waitForDeployment();
  });

  it('accepts valid broadcast responses for any consumer', async function () {
    const signed = await response();
    expect(await verifier.verify(signed, SemanticClass.Broadcast, consumerA, request1, epoch, false, false)).to.equal(Status.Accepted);
    expect(await verifier.verify(signed, SemanticClass.Broadcast, consumerB, request1, epoch, false, false)).to.equal(Status.Accepted);
  });

  it('rejects cross-consumer misuse for consumer-scoped binding', async function () {
    const signed = await response(consumerA, request1, epoch, true, false);
    expect(await verifier.verify(signed, SemanticClass.ConsumerScoped, consumerA, request1, epoch, true, false)).to.equal(Status.Accepted);
    expect(await verifier.verify(signed, SemanticClass.ConsumerScoped, consumerB, request1, epoch, true, false)).to.equal(Status.ConsumerMismatch);
  });

  it('shows consumer-scoped under-binding is vulnerable', async function () {
    const signed = await response(consumerA, request1, epoch, false, false);
    expect(await verifier.verify(signed, SemanticClass.ConsumerScoped, consumerB, request1, epoch, false, false)).to.equal(Status.Accepted);
  });

  it('rejects request substitution only when RequestID is bound', async function () {
    const underBound = await response(consumerA, request1, epoch, true, false);
    expect(await verifier.verify(underBound, SemanticClass.RequestScoped, consumerA, request2, epoch, true, false)).to.equal(Status.Accepted);

    const correctlyBound = await response(consumerA, request1, epoch, true, true);
    expect(await verifier.verify(correctlyBound, SemanticClass.RequestScoped, consumerA, request1, epoch, true, true)).to.equal(Status.Accepted);
    expect(await verifier.verify(correctlyBound, SemanticClass.RequestScoped, consumerA, request2, epoch, true, true)).to.equal(Status.RequestMismatch);
  });

  it('rejects stale responses', async function () {
    const signed = await response(consumerA, request1, epoch, true, true);
    expect(await verifier.verify(signed, SemanticClass.RequestScoped, consumerA, request1, epoch + 1n, true, true)).to.equal(Status.StaleResponse);
  });

  it('rejects modified data, consumer, and request fields with the original signature', async function () {
    const signed = await response(consumerA, request1, epoch, true, true);
    expect(await verifier.verify({ ...signed, data: 101n }, SemanticClass.RequestScoped, consumerA, request1, epoch, true, true)).to.equal(Status.InvalidSignature);
    expect(await verifier.verify({ ...signed, consumerId: consumerB }, SemanticClass.RequestScoped, consumerB, request1, epoch, true, true)).to.equal(Status.InvalidSignature);
    expect(await verifier.verify({ ...signed, requestId: request2 }, SemanticClass.RequestScoped, consumerA, request2, epoch, true, true)).to.equal(Status.InvalidSignature);
  });

  it('verifies an over-bound broadcast response but gives it no cross-consumer security benefit', async function () {
    const signed = await response(consumerA, request1, epoch, true, true);
    expect(await verifier.verify(signed, SemanticClass.Broadcast, consumerB, request1, epoch, true, true)).to.equal(Status.Accepted);
  });

  it('accepts field-selective broadcast, consumer, and request verification', async function () {
    const broadcastSignature = await oracle.signMessage(ethers.getBytes(await verifier.broadcastDigest(data, epoch)));
    expect(await verifier.verifyBroadcast(data, epoch, broadcastSignature, epoch)).to.equal(Status.Accepted);

    const consumerSignature = await oracle.signMessage(ethers.getBytes(await verifier.consumerDigest(data, consumerA, epoch)));
    expect(await verifier.verifyConsumer(data, consumerA, epoch, consumerSignature, consumerA, epoch)).to.equal(Status.Accepted);
    expect(await verifier.verifyConsumer(data, consumerA, epoch, consumerSignature, consumerB, epoch)).to.equal(Status.ConsumerMismatch);

    const requestSignature = await oracle.signMessage(ethers.getBytes(await verifier.requestDigest(data, consumerA, request1, epoch)));
    expect(await verifier.verifyRequest(data, consumerA, request1, epoch, requestSignature, consumerA, request1, epoch)).to.equal(Status.Accepted);
    expect(await verifier.verifyRequest(data, consumerA, request1, epoch, requestSignature, consumerA, request2, epoch)).to.equal(Status.RequestMismatch);
  });
});
