// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {OrganizationRegistry} from "./OrganizationRegistry.sol";
import {Types} from "../libs/Types.sol";

contract TelemetryAnchor {
    OrganizationRegistry public orgs;
    struct Anchor {
        uint256 id;
        bytes32 root;
        uint256 refId;
        uint8 refType;
        uint64 fromTs;
        uint64 toTs;
        string storageUri;
        uint256 actorOrgId;
    }
    uint256 private _seq;
    mapping(uint256 => Anchor) private _byId;
    mapping(uint256 => uint256[]) private _byRef;
    event TelemetryAnchored(
        uint256 indexed id,
        bytes32 root,
        uint8 refType,
        uint256 refId,
        uint64 fromTs,
        uint64 toTs,
        string storageUri,
        uint256 actorOrgId
    );
    modifier onlyActiveOrg() {
        uint256 orgId = orgs.orgIdOf(msg.sender);
        Types.Organization memory o = orgs.getOrganization(orgId);
        require(o.id != 0 && o.active, "ORG_INACTIVE");
        _;
    }
    constructor(OrganizationRegistry _orgs) {
        orgs = _orgs;
    }
    function anchor(
        bytes32 root,
        uint8 refType,
        uint256 refId,
        uint64 fromTs,
        uint64 toTs,
        string calldata storageUri
    ) external onlyActiveOrg returns (uint256 id) {
        require(root != bytes32(0), "ROOT_ZERO");
        require(refType == 1 || refType == 2, "BAD_REFTYPE");
        require(fromTs <= toTs, "BAD_RANGE");
        id = ++_seq;
        uint256 orgId = orgs.orgIdOf(msg.sender);
        Anchor memory a = Anchor({
            id: id,
            root: root,
            refId: refId,
            refType: refType,
            fromTs: fromTs,
            toTs: toTs,
            storageUri: storageUri,
            actorOrgId: orgId
        });
        _byId[id] = a;
        uint256 refKey = (uint256(refType) << 248) | refId;
        _byRef[refKey].push(id);
        emit TelemetryAnchored(
            id,
            root,
            refType,
            refId,
            fromTs,
            toTs,
            storageUri,
            orgId
        );
    }
    function get(uint256 id) external view returns (Anchor memory) {
        return _byId[id];
    }
    function getByRef(
        uint8 refType,
        uint256 refId
    ) external view returns (Anchor[] memory out) {
        uint256 refKey = (uint256(refType) << 248) | refId;
        uint256[] memory ids = _byRef[refKey];
        out = new Anchor[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = _byId[ids[i]];
        }
    }
}
