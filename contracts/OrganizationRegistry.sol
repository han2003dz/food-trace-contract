// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {RoleManager} from "./RoleManager.sol";
import {Types} from "../libs/Types.sol";
contract OrganizationRegistry is RoleManager {
    uint256 private _orgSeq;
    mapping(uint256 => Types.Organization) private _orgById;
    mapping(address => uint256) public orgIdOf;
    event OrganizationRegistered(
        uint256 indexed id,
        address indexed wallet,
        Types.OrgType orgType,
        string name,
        string metadataCid,
        bool active
    );

    event OrganizationUpdated(
        uint256 indexed id,
        address indexed wallet,
        Types.OrgType orgType,
        string name,
        string metadataCid,
        bool active
    );

    function registerOrganization(
        address wallet,
        Types.OrgType orgType,
        string calldata name,
        string calldata metadataCid,
        bool active
    ) external onlySuperAdmin returns (uint256 id) {
        require(wallet != address(0), "INVALID_WALLET");
        require(orgType != Types.OrgType.NONE, "INVALID_ORG_TYPE");
        require(orgIdOf[wallet] == 0, "ORG_ALREADY_REGISTERED");
        id = ++_orgSeq;
        _orgById[id] = Types.Organization({
            id: id,
            wallet: wallet,
            orgType: orgType,
            name: name,
            metadataCid: metadataCid,
            active: active
        });

        orgIdOf[wallet] = id;
        emit OrganizationRegistered(
            id,
            wallet,
            orgType,
            name,
            metadataCid,
            active
        );
    }

    function updateOrganization(
        uint256 id,
        address wallet,
        Types.OrgType orgType,
        string calldata name,
        string calldata metadataCid,
        bool active
    ) external onlySuperAdmin {
        Types.Organization storage org = _orgById[id];
        require(org.id != 0, "ORG_NOT_FOUND");
        if (wallet != address(0) && wallet != org.wallet) {
            require(orgIdOf[wallet] == 0, "WALLET_ALREADY_REGISTERED");
            delete orgIdOf[org.wallet];
            org.wallet = wallet;
            orgIdOf[wallet] = id;
        }

        if (orgType != Types.OrgType.NONE) {
            org.orgType = orgType;
        }

        org.orgType = orgType;
        org.name = name;
        org.metadataCid = metadataCid;
        org.active = active;

        emit OrganizationUpdated(
            id,
            org.wallet,
            orgType,
            name,
            metadataCid,
            active
        );
    }

    function getOrganization(
        uint256 id
    ) external view returns (Types.Organization memory) {
        return _orgById[id];
    }
}
