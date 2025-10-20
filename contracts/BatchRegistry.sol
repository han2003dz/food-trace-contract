// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {OrganizationRegistry} from "./OrganizationRegistry.sol";
import {Types} from "../libs/Types.sol";
contract BatchRegistry {
    OrganizationRegistry public orgs;
    uint256 private _batchSeq;
    uint256 private _eventSeq;
    mapping(uint256 => Types.Batch) private _batchById;
    mapping(uint256 => uint256[]) private _childrenOf;
    mapping(uint256 => Types.BatchEvent[]) private _eventsOf;
    bool public paused;

    event Paused(bool status);
    event BatchCreated(
        uint256 indexed batchId,
        uint256 parentId,
        uint256 ownerOrgId,
        string productType,
        string metadataCid,
        bytes32 dataHash
    );
    event BatchEventAppended(
        uint256 indexed eventId,
        uint256 indexed batchId,
        Types.EventType eventType,
        uint256 actorOrgId,
        string metadataCid,
        bytes32 dataHash
    );
    event OwnerTransferred(
        uint256 indexed batchId,
        uint256 oldOwnerOrgId,
        uint256 newOwnerOrgId
    );
    event BatchStatusUpdated(
        uint256 indexed batchId,
        Types.BatchStatus oldStatus,
        Types.BatchStatus newStatus
    );

    constructor(OrganizationRegistry _orgs) {
        orgs = _orgs;
    }

    modifier onlyActiveOrg() {
        uint256 orgId = orgs.orgIdOf(msg.sender);
        require(orgId != 0, "ORG_NOT_REGISTERED");
        Types.Organization memory org = orgs.getOrganization(orgId);
        require(org.active, "ORG_NOT_ACTIVE");
        _;
    }

    modifier notPaused() {
        require(!paused, "CONTRACT_PAUSED");
        _;
    }

    function setPaused(bool _p) external {
        address s = msg.sender;
        require(orgs.superAdmins(s) || s == orgs.owner(), "NO_AUTH");
        paused = _p;
        emit Paused(_p);
    }

    function createBatch(
        string calldata productType,
        string calldata metadataCid,
        bytes32 dataHash,
        uint256 parentId
    ) external notPaused onlyActiveOrg returns (uint256 id) {
        (uint256 ownerOrgId, ) = _requireSenderOrgActive();
        return
            _createBatch(
                ownerOrgId,
                productType,
                metadataCid,
                dataHash,
                parentId
            );
    }

    function _createBatch(
        uint256 ownerOrgId,
        string memory productType,
        string memory metadataCid,
        bytes32 dataHash,
        uint256 parentId
    ) internal returns (uint256 id) {
        if (parentId != 0) {
            require(_batchById[parentId].id != 0, "PARENT_NOT_FOUND");
        }

        id = ++_batchSeq;
        Types.Batch storage b = _batchById[id];
        b.id = id;
        b.parentId = parentId;
        b.ownerOrgId = ownerOrgId;
        b.status = parentId == 0
            ? Types.BatchStatus.HARVESTED
            : _batchById[parentId].status;
        b.productType = productType;
        b.metadataCid = metadataCid;
        b.dataHash = dataHash;
        b.createdAt = block.timestamp;

        if (parentId != 0) {
            _childrenOf[parentId].push(id);
        }

        emit BatchCreated(
            id,
            parentId,
            ownerOrgId,
            productType,
            metadataCid,
            dataHash
        );
    }

    function transferBatchOwner(
        uint256 batchId,
        uint256 newOwnerOrgId
    ) external notPaused onlyActiveOrg {
        Types.Batch storage b = _requireBatchOwnedBySender(batchId);
        Types.Organization memory target = orgs.getOrganization(newOwnerOrgId);
        require(target.id != 0 && target.active, "TARGET_INACTIVE");
        uint256 old = b.ownerOrgId;
        b.ownerOrgId = newOwnerOrgId;
        emit OwnerTransferred(batchId, old, newOwnerOrgId);
    }

    function updateBatchStatus(
        uint256 batchId,
        Types.BatchStatus newStatus
    ) external notPaused onlyActiveOrg {
        Types.Batch storage b = _requireBatchOwnedBySender(batchId);
        Types.BatchStatus old = b.status;
        require(uint(newStatus) >= uint(old), "INVALID_STATE_BACKWARD");
        b.status = newStatus;
        emit BatchStatusUpdated(batchId, old, newStatus);
    }

    function splitBatch(
        uint256 batchId,
        uint256 numChildren
    ) external notPaused onlyActiveOrg returns (uint256[] memory childIds) {
        require(numChildren > 0 && numChildren <= 64, "BAD_COUNT");
        Types.Batch storage parent = _requireBatchOwnedBySender(batchId);
        (uint256 ownerOrgId, ) = _requireSenderOrgActive();

        childIds = new uint256[](numChildren);
        for (uint256 i = 0; i < numChildren; i++) {
            uint256 cid = _createBatch(
                ownerOrgId,
                parent.productType,
                parent.metadataCid,
                parent.dataHash,
                batchId
            );
            childIds[i] = cid;
        }
    }

    function mergeBatches(
        uint256[] calldata sources,
        string calldata productType,
        string calldata metadataCid,
        bytes32 dataHash
    ) external notPaused onlyActiveOrg returns (uint256 mergedId) {
        require(sources.length >= 2 && sources.length <= 64, "BAD_SOURCES");
        (uint256 actorOrgId, ) = _requireSenderOrgActive();

        for (uint256 i = 0; i < sources.length; i++) {
            Types.Batch storage sb = _requireBatchOwnedBySender(sources[i]);
            require(
                sb.status != Types.BatchStatus.RECALLED &&
                    sb.status != Types.BatchStatus.FROZEN,
                "SRC_LOCKED"
            );
        }

        mergedId = _createBatch(
            actorOrgId,
            productType,
            metadataCid,
            dataHash,
            0
        );
        for (uint256 i = 0; i < sources.length; i++) {
            _appendEventInternal(
                sources[i],
                Types.EventType.PROCESS,
                actorOrgId,
                metadataCid,
                dataHash
            );
        }
        _appendEventInternal(
            mergedId,
            Types.EventType.PROCESS,
            actorOrgId,
            metadataCid,
            dataHash
        );
    }

    function appendEvent(
        uint256 batchId,
        Types.EventType eventType,
        string calldata metadataCid,
        bytes32 dataHash
    ) external notPaused onlyActiveOrg returns (uint256 eventId) {
        (uint256 actorOrgId, ) = _requireSenderOrgActive();
        return
            _appendEventInternal(
                batchId,
                eventType,
                actorOrgId,
                metadataCid,
                dataHash
            );
    }
    function _appendEventInternal(
        uint256 batchId,
        Types.EventType eventType,
        uint256 actorOrgId,
        string calldata metadataCid,
        bytes32 dataHash
    ) internal returns (uint256 eventId) {
        Types.Batch storage b = _batchById[batchId];
        require(b.id != 0, "BATCH_NOT_FOUND");
        eventId = ++_eventSeq;
        Types.BatchEvent memory ev = Types.BatchEvent({
            id: eventId,
            batchId: batchId,
            eventType: eventType,
            actorOrgId: actorOrgId,
            metadataCid: metadataCid,
            dataHash: dataHash,
            at: block.timestamp
        });
        _eventsOf[batchId].push(ev);
        emit BatchEventAppended(
            eventId,
            batchId,
            eventType,
            actorOrgId,
            metadataCid,
            dataHash
        );
    }

    function getBatch(uint256 id) external view returns (Types.Batch memory) {
        return _batchById[id];
    }
    function getChildren(uint256 id) external view returns (uint256[] memory) {
        return _childrenOf[id];
    }
    function getEvents(
        uint256 batchId
    ) external view returns (Types.BatchEvent[] memory) {
        return _eventsOf[batchId];
    }

    function _requireSenderOrgActive()
        internal
        view
        returns (uint256 orgId, bool active)
    {
        orgId = orgs.orgIdOf(msg.sender);
        Types.Organization memory o = orgs.getOrganization(orgId);
        active = o.active;
    }
    function _requireBatchOwnedBySender(
        uint256 batchId
    ) internal view returns (Types.Batch storage b) {
        uint256 orgId = orgs.orgIdOf(msg.sender);
        b = _batchById[batchId];
        require(b.id != 0, "BATCH_NOT_FOUND");
        require(b.ownerOrgId == orgId, "NOT_OWNER_ORG");
    }
}
