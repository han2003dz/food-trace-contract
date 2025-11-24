import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("TraceabilityMerkleRegistry", function () {
  let owner: any;
  let producer: any;
  let processor: any;
  let transporter: any;
  let retailer: any;
  let auditor: any;
  let contract: any;

  const ROLE_PRODUCER = 1 << 0;
  const ROLE_PROCESSOR = 1 << 1;
  const ROLE_TRANSPORTER = 1 << 2;
  const ROLE_RETAILER = 1 << 3;
  const ROLE_AUDITOR = 1 << 4;

  // Enum mapping (for readability)
  const EventType = {
    Created: 0,
    Processed: 1,
    Shipped: 2,
    Received: 3,
    Stored: 4,
    Sold: 5,
    Recalled: 6,
    Custom: 7,
  } as const;

  beforeEach("Deployment", async function () {
    [owner, producer, processor, transporter, retailer, auditor] =
      await ethers.getSigners();

    const Factory = await ethers.getContractFactory(
      "TraceabilityMerkleRegistry"
    );
    contract = await Factory.deploy();
    await contract.waitForDeployment();

    // Assign roles
    await contract.setRoles(producer.address, ROLE_PRODUCER);
    await contract.setRoles(processor.address, ROLE_PROCESSOR);
    await contract.setRoles(transporter.address, ROLE_TRANSPORTER);
    await contract.setRoles(retailer.address, ROLE_RETAILER);
    await contract.setRoles(auditor.address, ROLE_AUDITOR);
  });

  it("should deploy with correct owner", async function () {
    expect(await contract.owner()).to.equal(owner.address);
    expect(await contract.paused()).to.equal(false);
  });

  it("should allow owner to set roles", async function () {
    await contract.setRoles(producer.address, ROLE_PRODUCER);
    const roles = await contract.roles(producer.address);
    expect(roles).to.equal(ROLE_PRODUCER);
  });

  it("should allow producer to create a product", async function () {
    const tx = await contract
      .connect(producer)
      .createProduct("Coffee Beans Premium", "ipfs://Qm123456");
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l: any) => l.fragment?.name === "ProductCreated"
    );

    expect(event.args.name).to.equal("Coffee Beans Premium");
    expect(await contract.nextProductId()).to.equal(2n);
  });

  it("should not allow non-producer to create a product", async function () {
    await expect(
      contract.connect(processor).createProduct("Milk", "ipfs://QmMilk")
    ).to.be.revertedWithCustomError(contract, "Unauthorized");
  });

  it("should allow producer to create batch for existing product", async function () {
    await contract.connect(producer).createProduct("Coffee", "ipfs://meta");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("batch-meta"));
    const tx = await contract.connect(producer).createBatch(1, hash);
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l: any) => l.fragment?.name === "BatchCreated"
    );
    expect(event.args.productId).to.equal(1n);
    expect(await contract.nextBatchId()).to.equal(2n);
  });

  it("should revert createBatch if product not exist", async function () {
    const hash = ethers.keccak256(ethers.toUtf8Bytes("invalid-batch"));
    await expect(
      contract.connect(producer).createBatch(999, hash)
    ).to.be.revertedWithCustomError(contract, "InvalidProduct");
  });

  it("should allow owner or current owner to bind batchCode", async function () {
    await contract.connect(producer).createProduct("Tea", "ipfs://meta");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
    await contract.connect(producer).createBatch(1, hash);

    const batchCode = "BATCH-TEA-001";
    const tx = await contract.connect(producer).bindBatchCode(1, batchCode);
    await expect(tx)
      .to.emit(contract, "BatchCodeBound")
      .withArgs(1n, ethers.keccak256(ethers.toUtf8Bytes(batchCode)), batchCode);
  });

  it("should revert when binding duplicate batchCode", async function () {
    await contract.connect(producer).createProduct("Tea", "ipfs://meta");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("data"));
    await contract.connect(producer).createBatch(1, hash);
    const batchCode = "BATCH-TEA-001";
    await contract.connect(producer).bindBatchCode(1, batchCode);

    await expect(
      contract.connect(owner).bindBatchCode(1, batchCode)
    ).to.be.revertedWithCustomError(contract, "BatchCodeAlreadyUsed");
  });

  it("should record valid Processed event (by producer)", async function () {
    await contract.connect(producer).createProduct("Coffee", "ipfs://meta");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("batch1"));
    await contract.connect(producer).createBatch(1, hash);

    const dataHash = ethers.keccak256(ethers.toUtf8Bytes("processed"));

    await expect(
      contract
        .connect(producer)
        .recordTraceEvent(1, EventType.Processed, dataHash, ethers.ZeroAddress)
    ).to.emit(contract, "TraceEventRecorded");

    const ev = await contract.getBatchEvents(1);
    expect(ev.length).to.equal(2); // Created + Processed
  });

  it("should revert trace event if unauthorized role", async function () {
    await contract.connect(producer).createProduct("Coffee", "ipfs://meta");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("batch1"));
    await contract.connect(producer).createBatch(1, hash);

    const dataHash = ethers.keccak256(ethers.toUtf8Bytes("ship"));
    await expect(
      contract
        .connect(retailer)
        .recordTraceEvent(1, EventType.Shipped, dataHash, processor.address)
    ).to.be.revertedWithCustomError(contract, "Unauthorized");
  });

  it("Retailer cannot record Shipped event", async function () {
    await contract.connect(producer).createProduct("Coffee", "ipfs://meta");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("batch1"));
    await contract.connect(producer).createBatch(1, hash);
    const dataHash = ethers.keccak256(ethers.toUtf8Bytes("ship"));

    await expect(
      contract
        .connect(retailer)
        .recordTraceEvent(1, EventType.Shipped, dataHash, processor.address)
    ).to.be.revertedWithCustomError(contract, "Unauthorized");
  });

  // =========================
  // TRANSFER / PENDING RECEIVER FLOW
  // =========================

  it("should allow producer to ship to transporter, and transporter to receive & become currentOwner", async function () {
    await contract.connect(producer).createProduct("Coffee", "ipfs://meta");
    const initHash = ethers.keccak256(ethers.toUtf8Bytes("batch1"));
    await contract.connect(producer).createBatch(1, initHash);

    // Producer ships to transporter
    const shipHash = ethers.keccak256(ethers.toUtf8Bytes("ship#1"));
    await expect(
      contract
        .connect(producer)
        .recordTraceEvent(1, EventType.Shipped, shipHash, transporter.address)
    ).to.emit(contract, "TraceEventRecorded");

    // Check pendingReceiver set
    const batchAfterShip = await contract.batches(1);
    expect(batchAfterShip.pendingReceiver).to.equal(transporter.address);

    // Transporter receives
    const recvHash = ethers.keccak256(ethers.toUtf8Bytes("recv#1"));
    await expect(
      contract.connect(transporter).recordTraceEvent(
        1,
        EventType.Received,
        recvHash,
        ethers.ZeroAddress // ignored in Received
      )
    ).to.emit(contract, "TraceEventRecorded");

    const batchAfterReceive = await contract.batches(1);
    expect(batchAfterReceive.currentOwner).to.equal(transporter.address);
    expect(batchAfterReceive.pendingReceiver).to.equal(ethers.ZeroAddress);
    expect(batchAfterReceive.closed).to.equal(false);

    const events = await contract.getBatchEvents(1);
    // Created + Shipped + Received = 3
    expect(events.length).to.equal(3);
  });

  it("should revert when shipping to self", async function () {
    await contract.connect(producer).createProduct("Coffee", "ipfs://meta");
    const initHash = ethers.keccak256(ethers.toUtf8Bytes("batch1"));
    await contract.connect(producer).createBatch(1, initHash);

    const shipHash = ethers.keccak256(ethers.toUtf8Bytes("invalid-self-ship"));

    await expect(
      contract.connect(producer).recordTraceEvent(
        1,
        EventType.Shipped,
        shipHash,
        producer.address // self
      )
    ).to.be.revertedWithCustomError(contract, "Unauthorized");
  });

  it("should revert when non-pending receiver tries to receive", async function () {
    await contract.connect(producer).createProduct("Coffee", "ipfs://meta");
    const initHash = ethers.keccak256(ethers.toUtf8Bytes("batch1"));
    await contract.connect(producer).createBatch(1, initHash);

    // Producer ships to transporter
    const shipHash = ethers.keccak256(ethers.toUtf8Bytes("ship#1"));
    await contract
      .connect(producer)
      .recordTraceEvent(1, EventType.Shipped, shipHash, transporter.address);

    const recvHash = ethers.keccak256(ethers.toUtf8Bytes("recv#by-retailer"));

    // Retailer tries to receive but is not pendingReceiver
    await expect(
      contract
        .connect(retailer)
        .recordTraceEvent(1, EventType.Received, recvHash, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(contract, "Unauthorized");
  });

  it("should revert Received if no pendingReceiver exists", async function () {
    await contract.connect(producer).createProduct("Coffee", "ipfs://meta");
    const initHash = ethers.keccak256(ethers.toUtf8Bytes("batch1"));
    await contract.connect(producer).createBatch(1, initHash);

    const recvHash = ethers.keccak256(ethers.toUtf8Bytes("recv#no-pending"));

    await expect(
      contract
        .connect(processor)
        .recordTraceEvent(1, EventType.Received, recvHash, ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(contract, "Unauthorized");
  });

  // =========================
  // MERKLE ROOT
  // =========================

  it("should allow auditor to commit Merkle root", async function () {
    await contract.connect(producer).createProduct("Coffee", "ipfs://meta");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("batch1"));
    await contract.connect(producer).createBatch(1, hash);

    const root = ethers.keccak256(ethers.toUtf8Bytes("merkle#001"));
    const tx = await contract.connect(auditor).commitBatchMerkleRoot(1, root);
    await tx.wait();

    const stored = await contract.batchMerkleRoot(1);
    expect(stored).to.equal(root);
  });

  it("should revert when committing duplicate Merkle root", async function () {
    await contract.connect(producer).createProduct("Coffee", "ipfs://meta");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("batch1"));
    await contract.connect(producer).createBatch(1, hash);

    const root = ethers.keccak256(ethers.toUtf8Bytes("merkle#dup"));
    await contract.connect(auditor).commitBatchMerkleRoot(1, root);
    await expect(
      contract.connect(auditor).commitBatchMerkleRoot(1, root)
    ).to.be.revertedWithCustomError(contract, "MerkleRootAlreadySet");
  });

  // =========================
  // PAUSE / UNPAUSE
  // =========================

  it("should pause and unpause only by owner", async function () {
    await contract.pause();
    expect(await contract.paused()).to.equal(true);

    await contract.unpause();
    expect(await contract.paused()).to.equal(false);

    await expect(
      contract.connect(producer).pause()
    ).to.be.revertedWithCustomError(contract, "Unauthorized");
  });

  it("should prevent actions when paused", async function () {
    await contract.pause();
    await expect(
      contract.connect(producer).createProduct("Coffee", "ipfs://meta")
    ).to.be.revertedWithCustomError(contract, "PausedContract");
  });
});
