// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract TraceabilityMerkleRegistry {
    // ========= ERRORS =========
    error Unauthorized();
    error ZeroAddress();
    error InvalidProduct();
    error InvalidBatch();
    error BatchCodeAlreadyUsed();
    error BatchAlreadyClosed();
    error InvalidEventType();
    error MerkleRootAlreadySet();
    error PausedContract();

    // ========= EVENTS =========
    event RolesUpdated(address indexed account, uint256 roles);
    event ProductCreated(
        uint256 indexed productId,
        address indexed owner,
        string name,
        string metadataURI
    );
    event BatchCreated(
        uint256 indexed batchId,
        uint256 indexed productId,
        address indexed creator,
        bytes32 initialDataHash
    );
    event BatchCodeBound(
        uint256 indexed batchId,
        bytes32 indexed batchCodeHash,
        string batchCode
    );
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    event TraceEventRecorded(
        uint256 indexed eventId,
        uint256 indexed batchId,
        EventType eventType,
        address indexed actor,
        uint64 timestamp,
        bytes32 dataHash
    );
    event BatchMerkleRootCommitted(
        uint256 indexed batchId,
        bytes32 indexed merkleRoot,
        address indexed committer
    );
    event Paused(address account);
    event Unpaused(address account);

    // ========= ROLES =========
    uint256 public constant ROLE_PRODUCER = 1 << 0;
    uint256 public constant ROLE_PROCESSOR = 1 << 1;
    uint256 public constant ROLE_TRANSPORTER = 1 << 2;
    uint256 public constant ROLE_RETAILER = 1 << 3;
    uint256 public constant ROLE_AUDITOR = 1 << 4;

    address public owner;
    mapping(address => uint256) public roles;
    bool public paused;

    // ========= DATA STRUCTS =========
    struct Product {
        string name;
        string metadataURI;
        address owner;
        bool exists;
    }

    struct Batch {
        uint256 productId;
        address creator;
        address currentOwner;
        bytes32 initialDataHash;
        bool exists;
        bool closed;
        address pendingReceiver;
    }

    enum EventType {
        Created, // 0 - tạo batch
        Processed, // 1 - sơ chế/chế biến
        Shipped, // 2 - xuất kho / vận chuyển
        Received, // 3 - nhận hàng
        Stored, // 4 - lưu kho / bày bán
        Sold, // 5 - bán lẻ (kết thúc vòng đời)
        Recalled, // 6 - thu hồi (kết thúc vòng đời)
        Custom // 7 - sự kiện tùy chỉnh khác
    }

    struct TraceEvent {
        uint256 batchId;
        EventType eventType;
        address actor;
        uint64 timestamp;
        bytes32 dataHash; // hash(data off-chain)
    }

    // ========= STATE =========
    uint256 public nextProductId = 1;
    uint256 public nextBatchId = 1;
    uint256 public nextEventId = 1;

    mapping(uint256 => Product) public products; // productId => Product
    mapping(uint256 => Batch) public batches; // batchId => Batch
    mapping(uint256 => TraceEvent) public eventsById; // eventId => TraceEvent
    mapping(uint256 => uint256[]) public batchEvents; // batchId => [eventId]
    mapping(bytes32 => uint256) public batchCodeHashToBatchId; // hash(batchCode) => batchId
    mapping(uint256 => bytes32) public batchMerkleRoot; // batchId => merkleRoot

    // ========= MODIFIERS =========
    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedContract();
        _;
    }

    modifier onlyRole(uint256 requiredRole) {
        if ((roles[msg.sender] & requiredRole) == 0 && msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    modifier batchExists(uint256 batchId) {
        if (!batches[batchId].exists) revert InvalidBatch();
        _;
    }

    // ========= CONSTRUCTOR =========
    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ========= ADMIN FUNCTIONS =========
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setRoles(address account, uint256 newRoles) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        roles[account] = newRoles;
        emit RolesUpdated(account, newRoles);
    }

    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ========= PRODUCT LOGIC =========

    function createProduct(
        string calldata name,
        string calldata metadataURI
    )
        external
        whenNotPaused
        onlyRole(ROLE_PRODUCER)
        returns (uint256 productId)
    {
        productId = nextProductId++;

        products[productId] = Product({
            name: name,
            metadataURI: metadataURI,
            owner: msg.sender,
            exists: true
        });

        emit ProductCreated(productId, msg.sender, name, metadataURI);
    }

    // ========= BATCH LOGIC =========

    function createBatch(
        uint256 productId,
        bytes32 initialDataHash
    ) external whenNotPaused onlyRole(ROLE_PRODUCER) returns (uint256 batchId) {
        Product memory p = products[productId];
        if (!p.exists) revert InvalidProduct();

        batchId = nextBatchId++;

        batches[batchId] = Batch({
            productId: productId,
            creator: msg.sender,
            currentOwner: msg.sender,
            initialDataHash: initialDataHash,
            exists: true,
            closed: false,
            pendingReceiver: address(0)
        });

        _recordEvent(batchId, EventType.Created, msg.sender, initialDataHash);

        emit BatchCreated(batchId, productId, msg.sender, initialDataHash);
    }

    /// @notice Gắn BatchCode (dùng cho QR) với batchId (1-1)
    function bindBatchCode(
        uint256 batchId,
        string calldata batchCode
    ) external whenNotPaused batchExists(batchId) {
        Batch storage b = batches[batchId];
        if (
            msg.sender != b.currentOwner &&
            msg.sender != b.creator &&
            msg.sender != owner
        ) {
            revert Unauthorized();
        }
        if (b.closed) revert BatchAlreadyClosed();

        bytes32 h = keccak256(bytes(batchCode));
        if (batchCodeHashToBatchId[h] != 0) revert BatchCodeAlreadyUsed();

        batchCodeHashToBatchId[h] = batchId;

        emit BatchCodeBound(batchId, h, batchCode);
    }

    // ========= TRACE EVENT LOGIC =========

    /// @notice Ghi 1 TraceEvent cho batch (Process, Ship, Receive, Store, Sold, Recall, Custom)
    /// @param batchId batch cần ghi
    /// @param eventType loại sự kiện
    /// @param dataHash hash metadata off-chain (chi tiết sự kiện)
    /// @param receiver địa chỉ ví được chỉ định nhận (bắt buộc khi Shipped, ignore ở case khác)
    function recordTraceEvent(
        uint256 batchId,
        EventType eventType,
        bytes32 dataHash,
        address receiver
    ) external whenNotPaused batchExists(batchId) {
        Batch storage b = batches[batchId];
        if (b.closed) revert BatchAlreadyClosed();

        // 1. Check role
        _requireAuthorizedForEvent(eventType, msg.sender);

        // 2. Check business flow (currentOwner vs actor, pendingReceiver, ...)
        _requireValidFlow(batchId, eventType, msg.sender, receiver);

        // 3. Business side-effects

        // Nếu là Shipped → chỉ định người nhận tiếp theo
        if (eventType == EventType.Shipped) {
            if (receiver == address(0)) revert ZeroAddress();
            if (receiver == b.currentOwner) revert Unauthorized(); // không tự ship cho chính mình
            b.pendingReceiver = receiver;
        }

        // Nếu là Received → chỉ cho phép pendingReceiver nhận, đồng thời cập nhật chủ sở hữu
        if (eventType == EventType.Received) {
            require(b.pendingReceiver != address(0), "No pending receiver");
            require(msg.sender == b.pendingReceiver, "Not assigned receiver");
            b.currentOwner = msg.sender;
            b.pendingReceiver = address(0);
        }

        // Nếu Stored → thường là nơi lưu kho / bày bán, currentOwner đã là actor
        if (eventType == EventType.Stored) {
            b.currentOwner = msg.sender;
        }

        // Nếu Sold / Recalled → kết thúc vòng đời
        if (eventType == EventType.Sold || eventType == EventType.Recalled) {
            b.currentOwner = msg.sender;
            b.closed = true;
        }

        _recordEvent(batchId, eventType, msg.sender, dataHash);
    }

    function _recordEvent(
        uint256 batchId,
        EventType eventType,
        address actor,
        bytes32 dataHash
    ) internal {
        if (uint8(eventType) > uint8(EventType.Custom)) {
            revert InvalidEventType();
        }

        uint256 eventId = nextEventId++;

        eventsById[eventId] = TraceEvent({
            batchId: batchId,
            eventType: eventType,
            actor: actor,
            timestamp: uint64(block.timestamp),
            dataHash: dataHash
        });

        batchEvents[batchId].push(eventId);

        emit TraceEventRecorded(
            eventId,
            batchId,
            eventType,
            actor,
            uint64(block.timestamp),
            dataHash
        );
    }

    function _requireAuthorizedForEvent(
        EventType eventType,
        address account
    ) internal view {
        uint256 r = roles[account];
        if (account == owner) return;

        if (eventType == EventType.Created) {
            if ((r & ROLE_PRODUCER) == 0) revert Unauthorized();
        } else if (eventType == EventType.Processed) {
            if ((r & (ROLE_PRODUCER | ROLE_PROCESSOR)) == 0)
                revert Unauthorized();
        } else if (eventType == EventType.Shipped) {
            if (
                (r & (ROLE_PRODUCER | ROLE_PROCESSOR | ROLE_TRANSPORTER)) == 0
            ) {
                revert Unauthorized();
            }
        } else if (eventType == EventType.Received) {
            if (
                (r & (ROLE_TRANSPORTER | ROLE_PROCESSOR | ROLE_RETAILER)) == 0
            ) {
                revert Unauthorized();
            }
        } else if (eventType == EventType.Stored) {
            if ((r & (ROLE_RETAILER | ROLE_PROCESSOR)) == 0)
                revert Unauthorized();
        } else if (eventType == EventType.Sold) {
            if ((r & ROLE_RETAILER) == 0) revert Unauthorized();
        } else if (eventType == EventType.Recalled) {
            if ((r & (ROLE_PRODUCER | ROLE_RETAILER | ROLE_AUDITOR)) == 0) {
                revert Unauthorized();
            }
        } else if (eventType == EventType.Custom) {
            if (r == 0) revert Unauthorized();
        }
    }

    /// @dev Kiểm tra luồng chuyển giao theo business (owner, pendingReceiver, ...)
    function _requireValidFlow(
        uint256 batchId,
        EventType eventType,
        address actor,
        address receiver
    ) internal view {
        Batch storage b = batches[batchId];

        // Nếu batch đang ở trạng thái chờ nhận, CHỈ allow event RECEIVED
        if (b.pendingReceiver != address(0)) {
            if (eventType != EventType.Received) revert Unauthorized();
        }

        // Processed/Shipped/Stored/Sold/Recall/Custom → phải là currentOwner
        if (
            eventType == EventType.Processed ||
            eventType == EventType.Shipped ||
            eventType == EventType.Stored ||
            eventType == EventType.Sold ||
            eventType == EventType.Recalled ||
            eventType == EventType.Custom
        ) {
            if (actor != b.currentOwner && actor != owner)
                revert Unauthorized();
        }

        // SHIPPED logic
        if (eventType == EventType.Shipped) {
            if (receiver == address(0)) revert ZeroAddress();
            if (receiver == actor) revert Unauthorized();
        }

        // RECEIVED logic
        if (eventType == EventType.Received) {
            if (b.pendingReceiver == address(0)) revert Unauthorized();
            if (actor != b.pendingReceiver && actor != owner)
                revert Unauthorized();
        }
    }

    // ========= MERKLE ROOT =========

    function commitBatchMerkleRoot(
        uint256 batchId,
        bytes32 merkleRoot
    ) external whenNotPaused batchExists(batchId) {
        if (merkleRoot == bytes32(0)) revert InvalidEventType();
        if (batchMerkleRoot[batchId] != bytes32(0))
            revert MerkleRootAlreadySet();

        uint256 r = roles[msg.sender];
        if (msg.sender != owner && (r & ROLE_AUDITOR) == 0)
            revert Unauthorized();

        batchMerkleRoot[batchId] = merkleRoot;
        emit BatchMerkleRootCommitted(batchId, merkleRoot, msg.sender);
    }

    // ========= MERKLE VERIFY =========

    function verifyWithRoot(
        bytes32 leaf,
        bytes32 root,
        bytes32[] calldata proof
    ) external pure returns (bool) {
        return _computeRootFromProof(leaf, proof) == root;
    }

    function _computeRootFromProof(
        bytes32 leaf,
        bytes32[] calldata proof
    ) internal pure returns (bytes32) {
        bytes32 computed = leaf;
        uint256 len = proof.length;
        for (uint256 i = 0; i < len; ) {
            bytes32 p = proof[i];
            if (computed < p) {
                computed = keccak256(abi.encodePacked(computed, p));
            } else {
                computed = keccak256(abi.encodePacked(p, computed));
            }
            unchecked {
                ++i;
            }
        }
        return computed;
    }

    // ========= VIEW HELPERS =========

    function hasRole(
        address account,
        uint256 role
    ) external view returns (bool) {
        return (roles[account] & role) != 0;
    }

    function getBatchEvents(
        uint256 batchId
    ) external view returns (uint256[] memory) {
        return batchEvents[batchId];
    }
}
