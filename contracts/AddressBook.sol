// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OrganizationRegistry} from "./OrganizationRegistry.sol";
import {BatchRegistry} from "./BatchRegistry.sol";
import {CertRegistry} from "./CertRegistry.sol";
import {TelemetryAnchor} from "./TelemetryAnchor.sol";
import {RoleManager} from "./RoleManager.sol";

import {TraceabilityMerkleRegistry} from "./TraceabilityMerkleRegistry.sol";

contract AddressBook is RoleManager {
    OrganizationRegistry public orgs;
    BatchRegistry public batches;
    CertRegistry public certs;
    TelemetryAnchor public telemetry;
    TraceabilityMerkleRegistry public traceabilityMerkle;

    event Linked(
        address orgs,
        address batches,
        address certs,
        address telemetry,
        address traceabilityMerkle
    );

    /// @notice Gán địa chỉ các contract đã deploy sẵn
    function link(
        address _orgs,
        address _batches,
        address _certs,
        address _telemetry,
        address _traceabilityMerkle
    ) external onlyOwner {
        require(_orgs != address(0), "ZERO_ADDR");
        require(_batches != address(0), "ZERO_ADDR");
        require(_certs != address(0), "ZERO_ADDR");
        require(_telemetry != address(0), "ZERO_ADDR");
        require(_traceabilityMerkle != address(0), "ZERO_ADDR");

        orgs = OrganizationRegistry(_orgs);
        batches = BatchRegistry(payable(_batches));
        certs = CertRegistry(_certs);
        telemetry = TelemetryAnchor(_telemetry);
        traceabilityMerkle = TraceabilityMerkleRegistry(_traceabilityMerkle);

        emit Linked(_orgs, _batches, _certs, _telemetry, _traceabilityMerkle);
    }
}
