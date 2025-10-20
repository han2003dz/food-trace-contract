// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library Types {
    enum OrgType {
        NONE,
        FARM,
        PRCESSOR,
        LOGISTICS,
        RETAILER,
        AUDITOR,
        ADMIN
    }
    enum BatchStatus {
        NONE,
        HARVESTED,
        PROCESSED,
        PACKAGED,
        IN_TRANSIT,
        IN_WAREHOUSE,
        IN_RETAIL,
        SOLD,
        FROZEN,
        RECALLED
    }

    enum EventType {
        NONE,
        HARVEST,
        PROCESS,
        PACKAGE_,
        SHIP_START,
        SHIP_END,
        WAREHOUSE_IN,
        WAREHOUSE_OUT,
        RETAIL_IN,
        RETAIL_OUT,
        SOLD,
        FREEZE_,
        RECALL_
    }

    struct Organization {
        uint256 id;
        address wallet;
        OrgType orgType;
        string name;
        string metadataCid;
        bool active;
    }

    struct Batch {
        uint256 id;
        uint256 parentId;
        uint256 ownerOrgId;
        BatchStatus status;
        string productType;
        string metadataCid;
        bytes32 dataHash;
        uint256 createdAt;
    }

    struct BatchEvent {
        uint256 id;
        uint256 batchId;
        EventType eventType;
        uint256 actorOrgId;
        string metadataCid;
        bytes32 dataHash;
        uint256 at;
    }

    struct Certification {
        uint256 id;
        bytes32 subject;
        uint256 issuerOrgId;
        string metadataCid;
        uint256 expireAt;
        bool active;
    }
}
