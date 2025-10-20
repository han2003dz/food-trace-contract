// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Types} from "../libs/Types.sol";
import {OrganizationRegistry} from "./OrganizationRegistry.sol";
contract CertRegistry {
    OrganizationRegistry public orgs;
    uint256 private _certSeq;
    mapping(uint256 => Types.Certification) private _certById;

    event CertIssued(
        uint256 indexed id,
        bytes32 indexed subject,
        uint256 issuerOrgId,
        string metadataCid,
        uint64 expireAt
    );
    event CertRevoked(uint256 indexed id);

    modifier onlyAuditor() {
        uint256 orgId = orgs.orgIdOf(msg.sender);
        require(orgId != 0, "ORG_NOT_REGISTERED");
        Types.Organization memory org = orgs.getOrganization(orgId);
        require(org.active, "ORG_NOT_ACTIVE");
        require(
            org.orgType == Types.OrgType.AUDITOR,
            "ORG_NOT_AUTHORIZED_AS_AUDITOR"
        );
        _;
    }

    constructor(OrganizationRegistry _orgs) {
        orgs = _orgs;
    }

    function issueCert(
        bytes32 subject,
        string calldata metadataCid,
        uint64 expireAt
    ) external onlyAuditor returns (uint256 id) {
        id = ++_certSeq;
        uint256 issuerOrgId = orgs.orgIdOf(msg.sender);
        _certById[id] = Types.Certification({
            id: id,
            subject: subject,
            issuerOrgId: issuerOrgId,
            metadataCid: metadataCid,
            expireAt: expireAt,
            active: true
        });
        emit CertIssued(id, subject, issuerOrgId, metadataCid, expireAt);
    }

    function revokeCert(uint256 id) external onlyAuditor {
        Types.Certification storage cert = _certById[id];
        require(cert.id != 0, "CERT_NOT_FOUND");
        require(cert.active, "CERT_ALREADY_REVOKED");
        uint256 issuerOrgId = orgs.orgIdOf(msg.sender);
        require(
            cert.issuerOrgId == issuerOrgId,
            "NOT_AUTHORIZED_TO_REVOKE_CERT"
        );
        cert.active = false;
        emit CertRevoked(id);
    }

    function getCert(
        uint256 id
    ) external view returns (Types.Certification memory) {
        return _certById[id];
    }
}
