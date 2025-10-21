// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OrganizationRegistry} from "./OrganizationRegistry.sol";
import {BatchRegistry} from "./BatchRegistry.sol";
import {CertRegistry} from "./CertRegistry.sol";
import {TelemetryAnchor} from "./TelemetryAnchor.sol";
import {RoleManager} from "./RoleManager.sol";

contract AddressBook is RoleManager {
    OrganizationRegistry public orgs;
    BatchRegistry public batches;
    CertRegistry public certs;
    TelemetryAnchor public telemetry;

    event Linked(
        address orgs,
        address batches,
        address certs,
        address telemetry
    );

    /// @notice Gán địa chỉ các contract đã deploy sẵn
    function link(
        address _orgs,
        address _batches,
        address _certs,
        address _telemetry
    ) external onlyOwner {
        require(_orgs != address(0), "ZERO_ADDR");
        require(_batches != address(0), "ZERO_ADDR");
        require(_certs != address(0), "ZERO_ADDR");
        require(_telemetry != address(0), "ZERO_ADDR");

        orgs = OrganizationRegistry(_orgs);
        batches = BatchRegistry(payable(_batches));
        certs = CertRegistry(_certs);
        telemetry = TelemetryAnchor(_telemetry);

        emit Linked(_orgs, _batches, _certs, _telemetry);
    }
}
