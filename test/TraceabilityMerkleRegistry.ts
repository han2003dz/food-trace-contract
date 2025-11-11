import { expect } from "chai";
import { network } from "hardhat";
const { ethers } = await network.connect();

describe("TraceabilityMerkleRegistry", function () {
  let owner: any;
  let producer: any;
  let processor: any;
  let retailer: any;
  let auditor: any;
  let contract: any;

  beforeEach("Deployment", async function () {
    [owner, producer, processor, retailer, auditor] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory(
      "TraceabilityMerkleRegistry"
    );
    contract = await Factory.deploy();
    await contract.waitForDeployment();

    // Gán roles cho các actor
    const ROLE_PRODUCER = 1 << 0;
    const ROLE_PROCESSOR = 1 << 1;
    const ROLE_RETAILER = 1 << 3;
    const ROLE_AUDITOR = 1 << 4;

    await contract.setRoles(producer.address, ROLE_PRODUCER);
    await contract.setRoles(processor.address, ROLE_PROCESSOR);
    await contract.setRoles(retailer.address, ROLE_RETAILER);
    await contract.setRoles(auditor.address, ROLE_AUDITOR);
  });

  it("should deploy with correct owner", async function () {
    expect(await contract.owner()).to.equal(owner.address);
    expect(await contract.paused()).to.equal(false);
  });

  it("should allow owner to set roles", async function () {
    const roles = await contract.roles(producer.address);
    expect(roles).to.not.equal(0n);
  });

  it("should allow producer to create a product", async function () {
    const tx = await contract
      .connect(producer)
      .createProduct("Coffee Beans Premium", "ipfs://Qm123456");
    const receipt = await tx.wait();
    const event = receipt.logs.find(
      (l: any) => l.fragment.name === "ProductCreated"
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
      (l: any) => l.fragment.name === "BatchCreated"
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

  it("should record valid trace event (Processed by Processor)", async function () {
    await contract.connect(producer).createProduct("Coffee", "ipfs://meta");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("batch1"));
    await contract.connect(producer).createBatch(1, hash);

    const dataHash = ethers.keccak256(ethers.toUtf8Bytes("processed#001"));
    const tx = await contract
      .connect(processor)
      .recordTraceEvent(1, 1, dataHash); // EventType.Processed = 1 trong enum
    await tx.wait();

    const events = await contract.getBatchEvents(1);
    expect(events.length).to.equal(2); // Created + Processed
  });

  it("should revert trace event if unauthorized role", async function () {
    await contract.connect(producer).createProduct("Coffee", "ipfs://meta");
    const hash = ethers.keccak256(ethers.toUtf8Bytes("batch1"));
    await contract.connect(producer).createBatch(1, hash);

    const dataHash = ethers.keccak256(ethers.toUtf8Bytes("ship"));
    await expect(
      contract.connect(retailer).recordTraceEvent(1, 2, dataHash)
    ).to.be.revertedWithCustomError(contract, "Unauthorized");
  });

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
