// SPDX-License-Identifier: MIT
pragma solidity  ^0.8.20;
contract TraceabilityMerkleRegistry {
  error Unauthorized();
  error ZeroAddress();
  error InvalidProduct();
  error InvalidBatch();
  error BatchCodeAlreadyUsed();
  error BatchAlreadyClosed();
  error InvalidEventType();
  error MerkleRootAlreadySet();
  error PausedContract();
  event RolesUpdated(address indexed account, uint256 roles);
  event ProductCreated(
    uint256 indexed productId,
    address indexed owner,
    string name,
    string metadataURI
  );
  event BatchCreated(uint256 indexed batchId, uint256 indexed productId, address indexed creator, bytes32 initialDataHash);
  event BatchCodeBound(uint256 indexed batchId, bytes32 indexed batchCodeHash, string batchCode);
  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
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

  uint256 public constant ROLE_PRODUCER     = 1 << 0;
  uint256 public constant ROLE_PROCESSOR    = 1 << 1;
  uint256 public constant ROLE_TRANSPORTER  = 1 << 2;
  uint256 public constant ROLE_RETAILER     = 1 << 3;
  uint256 public constant ROLE_AUDITOR      = 1 << 4;

  address public owner;
  mapping(address => uint256) public roles;
  bool public paused;

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
  }

  enum EventType {
    Created,    // tạo batch
    Processed,  // sơ chế/chế biến
    Shipped,    // xuất kho / vận chuyển
    Received,   // nhận hàng
    Stored,     // lưu kho / bày bán
    Sold,       // bán lẻ (kết thúc vòng đời)
    Recalled,   // thu hồi (kết thúc vòng đời)
    Custom      // sự kiện tùy chỉnh khác
  }

  struct TraceEvent {
    uint256 batchId;
    EventType eventType;
    address actor;
    uint64 timestamp;
    bytes32 dataHash; // hash(data off-chain)
  }

  uint256 public nextProductId = 1;
  uint256 public nextBatchId = 1;
  uint256 public nextEventId = 1;

  mapping(uint256 => Product) public products;       // productId => Product
  mapping(uint256 => Batch) public batches;          // batchId => Batch
  mapping(uint256 => TraceEvent) public eventsById;  // eventId => TraceEvent
  mapping(uint256 => uint256[]) public batchEvents;
  mapping(bytes32 => uint256) public batchCodeHashToBatchId;   // BatchCode (QR) -> batchId (1-1)
  mapping(uint256 => bytes32) public batchMerkleRoot;

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

  /// @notice Set roles for 1 account.
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

  /// @notice Producer create product
  function createProduct(
    string calldata name,
    string calldata metadataURI
  ) external whenNotPaused onlyRole(ROLE_PRODUCER) returns (uint256 productId) {
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

  /// @notice Producer tạo Batch mới cho 1 Product
  /// @param productId id của Product đã tồn tại
  /// @param initialDataHash hash thông tin nguồn gốc cơ bản (JSON/IPFS,...)
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
        closed: false
    });

    _recordEvent(
        batchId,
        EventType.Created,
        msg.sender,
        initialDataHash
    );

    emit BatchCreated(batchId, productId, msg.sender, initialDataHash);
  }

  /// @notice Gắn BatchCode (dùng cho QR) với batchId (1-1)
    /// @dev Thường chỉ cho phép currentOwner hoặc Producer batch đó gắn
    function bindBatchCode(
        uint256 batchId,
        string calldata batchCode
    ) external whenNotPaused batchExists(batchId) {
        Batch storage b = batches[batchId];
        if (msg.sender != b.currentOwner && msg.sender != b.creator && msg.sender != owner) {
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
    function recordTraceEvent(
        uint256 batchId,
        EventType eventType,
        bytes32 dataHash
    ) external whenNotPaused batchExists(batchId) {
        Batch storage b = batches[batchId];
        if (b.closed) revert BatchAlreadyClosed();

        // Kiểm tra quyền theo loại event
        _requireAuthorizedForEvent(eventType, msg.sender);

        // Cập nhật owner trong một số case (logic demo, bạn có thể tinh chỉnh thêm)
        if (eventType == EventType.Received || eventType == EventType.Stored) {
            // người nhận / nơi lưu kho trở thành currentOwner
            b.currentOwner = msg.sender;
        }
        if (eventType == EventType.Sold || eventType == EventType.Recalled) {
            // kết thúc vòng đời batch
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

    function _requireAuthorizedForEvent(EventType eventType, address account) internal view {
        uint256 r = roles[account];
        if (account == owner) return;

        if (eventType == EventType.Created) {
            if ((r & ROLE_PRODUCER) == 0) revert Unauthorized();
        } else if (eventType == EventType.Processed) {
            if ((r & (ROLE_PRODUCER | ROLE_PROCESSOR)) == 0) revert Unauthorized();
        } else if (eventType == EventType.Shipped) {
            if ((r & (ROLE_PRODUCER | ROLE_PROCESSOR | ROLE_TRANSPORTER)) == 0) revert Unauthorized();
        } else if (eventType == EventType.Received) {
            if ((r & (ROLE_PROCESSOR | ROLE_RETAILER)) == 0) revert Unauthorized();
        } else if (eventType == EventType.Stored) {
            if ((r & (ROLE_RETAILER | ROLE_PROCESSOR)) == 0) revert Unauthorized();
        } else if (eventType == EventType.Sold) {
            if ((r & ROLE_RETAILER) == 0) revert Unauthorized();
        } else if (eventType == EventType.Recalled) {
            if ((r & (ROLE_PRODUCER | ROLE_RETAILER | ROLE_AUDITOR)) == 0) revert Unauthorized();
        } else if (eventType == EventType.Custom) {
            // Cho phép nhiều bên, tuỳ use-case; ở đây yêu cầu phải có ít nhất 1 role
            if (r == 0) revert Unauthorized();
        }
    }

    // ========= MERKLE ROOT (OPTIONAL, CHO DATA OFF-CHAIN) =========

    /// @notice Auditor (hoặc Owner) commit Merkle root chứa full log off-chain của batch.
    ///         Dùng để chứng minh dữ liệu off-chain không bị sửa.
    function commitBatchMerkleRoot(
        uint256 batchId,
        bytes32 merkleRoot
    ) external whenNotPaused batchExists(batchId) {
        if (merkleRoot == bytes32(0)) revert InvalidEventType();
        if (batchMerkleRoot[batchId] != bytes32(0)) revert MerkleRootAlreadySet();

        uint256 r = roles[msg.sender];
        if (msg.sender != owner && (r & ROLE_AUDITOR) == 0) revert Unauthorized();

        batchMerkleRoot[batchId] = merkleRoot;
        emit BatchMerkleRootCommitted(batchId, merkleRoot, msg.sender);
    }

    /// @notice Verify Merkle proof off-chain log (utility cho client).
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
            unchecked { ++i; }
        }
        return computed;
    }

    // ========= VIEW HELPERS =========

    function hasRole(address account, uint256 role) external view returns (bool) {
        return (roles[account] & role) != 0;
    }

    function getBatchEvents(uint256 batchId) external view returns (uint256[] memory) {
        return batchEvents[batchId];
    }
}
