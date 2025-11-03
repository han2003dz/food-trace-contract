// SPDX-License-Identifier: MIT
pragma solidity  ^0.8.20;

contract TraceabilityMerkleRegistry {
  error Unauthorized();
  error InvalidRoot();
  error InvalidRange();
  error ZeroAddress();
  error RootAlreadyCommitted();
  error BatchNotFound();

  event RootCommitted(
    uint256 indexed batchId,
    bytes32 indexed merkleRoot,
    uint256 fromEventId,
    uint256 toEventId,
    uint64 timestamp,
    address indexed commiter
  );
  event CommitterChanged(
    address indexed oldCommitter, 
    address indexed newCommitter
  );
  event OwnershipTransferred(
    address indexed previousOwner, 
    address indexed newOwner
  );
  event Paused(
    address account
  );
  event Unpaused( 
    address account
  );
  event BatchCodeBound(
    bytes32 indexed batchCodeHash,
    uint256 indexed batchId,
    string batchCode
  );
  event CommitterAdded(address indexed account);
  event CommitterRemoved(address indexed account);

  address public owner;
  address public committer;
  mapping(address => bool) public allowedCommitters;
  bool public paused;

  modifier onlyOwner() {
    if (msg.sender != owner) revert Unauthorized();
    _;
  }
  modifier onlyCommitter() {
    if (
      msg.sender != owner &&
      msg.sender != committer &&
      !allowedCommitters[msg.sender]
    ) revert Unauthorized();
    _;
  }
  modifier whenNotPaused() {
    if (paused) revert Unauthorized();
    _; 
  }

  struct MerkleBatch {
    bytes32 root;
    uint256 fromEventId;
    uint256 toEventId; 
    uint64 timestamp;
    address committer;
    bool exists;
  }

  uint256 public totalBatches;

  mapping(uint256 => MerkleBatch) public batches;
  mapping(bytes32 => bool) public rootSeen;
  mapping(bytes32 => uint256[]) private _batchCodeToBatchIds;

  constructor(address initialCommitter) {
    owner = msg.sender;
    address c = (initialCommitter == address(0) ? msg.sender : initialCommitter);
    committer = c;
    allowedCommitters[c] = true;

    emit OwnershipTransferred(address(0), owner);
    emit CommitterChanged(address(0), committer);
    emit CommitterAdded(c);
  }

  function transferOwnership(address newOwner) external onlyOwner {
    if (newOwner == address(0)) revert ZeroAddress();
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }

  function setCommitter(address newCommitter) external onlyOwner {
    if (newCommitter == address(0)) revert ZeroAddress();
    emit CommitterChanged(committer, newCommitter);
    committer = newCommitter; 

    if (!allowedCommitters[newCommitter]) {
      allowedCommitters[newCommitter] = true;
      emit CommitterAdded(newCommitter);
    }
  }

  function addCommitter(address account) external onlyOwner {
    if(account == address(0)) revert ZeroAddress();
    if (!allowedCommitters[account]) {
      allowedCommitters[account] = true;
      emit CommitterAdded(account);
    }
  }

  function removeCommitter(address account) external onlyOwner {
    if (allowedCommitters[account]) {
      allowedCommitters[account] = false;
      emit CommitterRemoved(account);
    }
  }

  function pause() external onlyOwner {
    paused = true;
    emit Paused(msg.sender);
  }

  function unpause() external onlyOwner {
    paused = false;
    emit Unpaused(msg.sender);
  }

  function commitMerkleRoot(
    bytes32 merkleRoot, 
    uint256 fromEventId, 
    uint256 toEventId
  ) public whenNotPaused onlyCommitter returns (uint256 batchId) {
    if (merkleRoot == bytes32(0)) revert InvalidRoot();
    if (fromEventId > toEventId) revert InvalidRange();
    if (rootSeen[merkleRoot]) revert RootAlreadyCommitted();

    batchId = ++totalBatches;

    batches[batchId] = MerkleBatch({
      root: merkleRoot,
      fromEventId: fromEventId,
      toEventId: toEventId,
      timestamp: uint64(block.timestamp),
      committer: msg.sender,
      exists: true
    });

    rootSeen[merkleRoot] = true;

    emit RootCommitted(
      batchId,
      merkleRoot,
      fromEventId,
      toEventId,
      uint64(block.timestamp),
      msg.sender
    );
  }

  function commitWithBatchCode(
    bytes32 merkleRoot, 
    uint256 fromEventId, 
    uint256 toEventId, 
    string calldata batchCode
  ) external whenNotPaused onlyCommitter returns (uint256 batchId) {
    batchId = commitMerkleRoot(merkleRoot, fromEventId, toEventId);
    _bindBatchCode(batchId, batchCode);
  }

  function bindBatchCode(uint256 batchId, string calldata batchCode) external whenNotPaused onlyCommitter {
    if (!batches[batchId].exists) revert BatchNotFound();
    _bindBatchCode(batchId, batchCode);
  }

  function _bindBatchCode(uint256 batchId, string calldata batchCode) internal {
    bytes32 h = keccak256(bytes(batchCode));
    _batchCodeToBatchIds[h].push(batchId);
    emit BatchCodeBound(h, batchId, batchCode);
  }

  function isEventIncluded(
    bytes32 leaf,
    uint256 batchId,
    bytes32[] calldata proof
  ) external view returns (bool) {
    MerkleBatch memory mb = batches[batchId];
    if (!mb.exists) return false;
    bytes32 computed = _computeRootFromProof(leaf, proof);
    return (computed == mb.root);
  }

  function verifyWithRoot(bytes32 leaf, bytes32 root, bytes32[] calldata proof) external pure returns (bool) {
    return _computeRootFromProof(leaf, proof) == root;
  }

  function getBatch(uint256 batchId) external view returns (MerkleBatch memory) {
    if (!batches[batchId].exists) revert BatchNotFound();
    return batches[batchId];
  }

  function getBatchIdsByBatchCode(string calldata batchCode) external view returns (uint256[] memory) {
    bytes32 h = keccak256(bytes(batchCode));
    return _batchCodeToBatchIds[h];
  }

  function _computeRootFromProof(bytes32 leaf, bytes32[] calldata proof) internal pure returns (bytes32) {
    bytes32 computed = leaf;
    uint256 len = proof.length;

    for (uint256 i = 0; i < len; ) {
      bytes32 p = proof[i];
      // sort pair then hash
      if (computed < p) {
          computed = keccak256(abi.encodePacked(computed, p));
      } else {
          computed = keccak256(abi.encodePacked(p, computed));
      }
      unchecked { ++i; }
    }
    return computed;
  }

  function isAuthorizedCommitter(address account) external view returns (bool) {
    return account == owner || account == committer || allowedCommitters[account];
  }
}
