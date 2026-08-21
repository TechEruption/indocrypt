// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import {MessageHashUtils} from '@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol';

contract SemanticOracleVerifier {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    bytes32 public constant TAG = keccak256('SEMANTIC_ORACLE_RESPONSE_V1');

    enum SemanticClass { Broadcast, GroupScoped, ConsumerScoped, RequestScoped }
    enum Status { Accepted, InvalidSignature, StaleResponse, ConsumerMismatch, RequestMismatch }

    address public immutable oracle;

    struct Response {
        uint256 data;
        uint256 consumerId;
        uint256 requestId;
        uint256 epoch;
        bytes signature;
    }

    constructor(address oracle_) {
        oracle = oracle_;
    }

    function digest(
        uint256 data,
        uint256 consumerId,
        uint256 requestId,
        uint256 epoch,
        bool bindConsumer,
        bool bindRequest
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            TAG,
            data,
            bindConsumer ? consumerId : uint256(0),
            bindRequest ? requestId : uint256(0),
            epoch
        ));
    }

    function broadcastDigest(uint256 data, uint256 epoch) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(TAG, data, epoch));
    }

    function consumerDigest(uint256 data, uint256 consumerId, uint256 epoch) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(TAG, data, consumerId, epoch));
    }

    function requestDigest(uint256 data, uint256 consumerId, uint256 requestId, uint256 epoch) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(TAG, data, consumerId, requestId, epoch));
    }

    function verifyBroadcast(uint256 data, uint256 epoch, bytes calldata signature, uint256 currentEpoch)
        external view returns (Status)
    {
        if (!_isOracleSignature(broadcastDigest(data, epoch), signature)) return Status.InvalidSignature;
        if (epoch < currentEpoch) return Status.StaleResponse;
        return Status.Accepted;
    }

    function verifyConsumer(
        uint256 data,
        uint256 consumerId,
        uint256 epoch,
        bytes calldata signature,
        uint256 expectedConsumerId,
        uint256 currentEpoch
    ) external view returns (Status) {
        if (!_isOracleSignature(consumerDigest(data, consumerId, epoch), signature)) return Status.InvalidSignature;
        if (epoch < currentEpoch) return Status.StaleResponse;
        if (consumerId != expectedConsumerId) return Status.ConsumerMismatch;
        return Status.Accepted;
    }

    function verifyRequest(
        uint256 data,
        uint256 consumerId,
        uint256 requestId,
        uint256 epoch,
        bytes calldata signature,
        uint256 expectedConsumerId,
        uint256 expectedRequestId,
        uint256 currentEpoch
    ) external view returns (Status) {
        if (!_isOracleSignature(requestDigest(data, consumerId, requestId, epoch), signature)) return Status.InvalidSignature;
        if (epoch < currentEpoch) return Status.StaleResponse;
        if (consumerId != expectedConsumerId) return Status.ConsumerMismatch;
        if (requestId != expectedRequestId) return Status.RequestMismatch;
        return Status.Accepted;
    }

    function verify(
        Response calldata response,
        SemanticClass semanticClass,
        uint256 expectedConsumerId,
        uint256 expectedRequestId,
        uint256 currentEpoch,
        bool bindConsumer,
        bool bindRequest
    ) external view returns (Status status) {
        bytes32 messageDigest = digest(
            response.data,
            response.consumerId,
            response.requestId,
            response.epoch,
            bindConsumer,
            bindRequest
        );

        address signer;
        try this.recover(messageDigest, response.signature) returns (address recovered) {
            signer = recovered;
        } catch {
            return Status.InvalidSignature;
        }
        if (signer != oracle) return Status.InvalidSignature;
        if (response.epoch < currentEpoch) return Status.StaleResponse;

        if (semanticClass == SemanticClass.ConsumerScoped || semanticClass == SemanticClass.RequestScoped) {
            if (bindConsumer && response.consumerId != expectedConsumerId) return Status.ConsumerMismatch;
        }
        if (semanticClass == SemanticClass.RequestScoped) {
            if (bindRequest && response.requestId != expectedRequestId) return Status.RequestMismatch;
        }
        return Status.Accepted;
    }

    function recover(bytes32 messageDigest, bytes calldata signature) external pure returns (address) {
        return messageDigest.toEthSignedMessageHash().recover(signature);
    }

    function _isOracleSignature(bytes32 messageDigest, bytes calldata signature) internal view returns (bool) {
        try this.recover(messageDigest, signature) returns (address recovered) {
            return recovered == oracle;
        } catch {
            return false;
        }
    }
}
