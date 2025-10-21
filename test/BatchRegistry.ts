import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("BatchRegistry", function () {
  let orgs: any;
  let batches: any;
  let owner: any;
  let farmer: any;
  let processor: any;

  beforeEach("BatchRegistry deployment", async function () {
    [owner, farmer, processor] = await ethers.getSigners();
    const OrganizationRegistry = await ethers.getContractFactory(
      "OrganizationRegistry"
    );
    orgs = await OrganizationRegistry.deploy();
    await orgs.waitForDeployment();

    await orgs
      .connect(owner)
      .registerOrganization(farmer.address, 1, "Farm A", "farm-cid", true);

    await orgs
      .connect(owner)
      .registerOrganization(
        processor.address,
        2,
        "Processor A",
        "proc-cid",
        true
      );

    const BatchRegistry = await ethers.getContractFactory("BatchRegistry");
    batches = await BatchRegistry.deploy(await orgs.getAddress());
    await batches.waitForDeployment();
  });

  it("Should create a new batch correctly", async () => {
    const tx = await batches
      .connect(farmer)
      .createBatch("Organic Apples", "cid-apple", ethers.id("Batch-001"), 0);

    await tx.wait();

    const batch = await batches.getBatch(1);
    expect(batch.id).to.equal(1n);
    expect(batch.ownerOrgId).to.equal(1n);
    expect(batch.productType).to.equal("Organic Apples");
    expect(batch.metadataCid).to.equal("cid-apple");
  });

  it("Should revert if org not registered", async () => {
    const outsider = await ethers.getSigner(ethers.ZeroAddress);
    await expect(
      batches
        .connect(outsider)
        .createBatch("Organic Apples", "cid-apple", ethers.id("Batch-001"), 0)
    ).to.be.revertedWith("ORG_NOT_REGISTERED");
  });

  //   TRANSFER OWNERSHIP TESTS
  it("Should transfer batch ownership correctly", async () => {
    await batches
      .connect(farmer)
      .createBatch("Balana", "cid-banana", ethers.id("Batch-002"), 0);

    await batches.connect(farmer).transferBatchOwner(1, 2);

    const batch = await batches.getBatch(1);

    expect(batch.ownerOrgId).to.equal(2n);
  });

  it("Should revert if transferring to inactive org", async () => {
    await batches
      .connect(farmer)
      .createBatch("Pineapple", "cid-pine", ethers.id("Batch-003"), 0);

    await orgs
      .connect(owner)
      .updateOrganization(2, processor.address, 2, "Proc", "cid", false);

    await expect(
      batches.connect(farmer).transferBatchOwner(1, 2)
    ).to.be.revertedWith("TARGET_INACTIVE");
  });

  it("Should update batch status correctly", async () => {
    await batches
      .connect(farmer)
      .createBatch("Mango", "cid-mango", ethers.id("Batch-004"), 0);
    await expect(batches.connect(farmer).updateBatchStatus(1, 1)).to.emit(
      batches,
      "BatchStatusUpdated"
    );
    const updatedBatch = await batches.getBatch(1);
    expect(updatedBatch.status).to.equal(1n);
  });

  it("Should revert if rollback batch status", async () => {
    await batches
      .connect(farmer)
      .createBatch("Apple", "cid-apple", ethers.id("Batch-005"), 0);

    await batches.connect(farmer).updateBatchStatus(1, 1);

    await expect(
      batches.connect(farmer).updateBatchStatus(1, 0)
    ).to.be.revertedWith("INVALID_STATE_BACKWARD");
  });

  it("Should split batch into children", async () => {
    await batches
      .connect(farmer)
      .createBatch("Apple", "cid-apple", ethers.id("Batch-006"), 0);

    const tx = await batches.connect(farmer).splitBatch(1, 3);
    const receipt = await tx.wait();

    const children = await batches.getChildren(1);

    console.log("children", children);
    expect(children.length).to.equal(3);
  });

  it("Should revert if split count invalid", async () => {
    await batches
      .connect(farmer)
      .createBatch("Apple", "cid-apple", ethers.id("Batch-007"), 0);

    await expect(batches.connect(farmer).splitBatch(1, 0)).to.be.revertedWith(
      "BAD_COUNT"
    );

    await expect(batches.connect(farmer).splitBatch(1, 65)).to.be.revertedWith(
      "BAD_COUNT"
    );
  });

  it("Should merge batches correctly", async () => {
    await Promise.all([
      batches
        .connect(farmer)
        .createBatch("Apple", "cid-apple-1", ethers.id("Batch-007"), 0),

      batches
        .connect(farmer)
        .createBatch("Apple", "cid-apple-2", ethers.id("Batch-008"), 0),
    ]);

    const sources = [1, 2];
    const tx = await batches
      .connect(farmer)
      .mergeBatches(
        sources,
        "MixedBanana",
        "cid-merged",
        ethers.id("Batch-009")
      );

    await tx.wait();

    const merged = await batches.getBatch(3);

    expect(merged.productType).to.equal("MixedBanana");
  });

  it("Should revert if merge sources invalid", async () => {
    await batches
      .connect(farmer)
      .createBatch("Rice", "cid1", ethers.id("dataC"), 0);
    await expect(
      batches.connect(farmer).mergeBatches([1], "New", "cid", ethers.id("d"))
    ).to.be.revertedWith("BAD_SOURCES");
  });

  it("Should append event correctly", async () => {
    await batches
      .connect(farmer)
      .createBatch("Apple", "cid-apple", ethers.id("Batch-011"), 0);

    const tx = await batches
      .connect(farmer)
      .appendEvent(1, 1, "cid-apple-process", ethers.id("Batch-012"));

    await tx.wait();

    const tx2 = await batches
      .connect(farmer)
      .appendEvent(1, 2, "cid-apple-package", ethers.id("Batch-013"));

    await tx2.wait();

    const events = await batches.getEvents(1);
    expect(events.length).to.equal(2);
    expect(events[0].metadataCid).to.equal("cid-apple-process");
    expect(events[1].metadataCid).to.equal("cid-apple-package");
    console.log("events", events);
    const batch = await batches.getBatch(1);
    console.log("batch", batch);
  });

  it("Should revert if appending to non-existing batch", async () => {
    await expect(
      batches.connect(farmer).appendEvent(999, 1, "cid", ethers.id("data"))
    ).to.be.revertedWith("BATCH_NOT_FOUND");
  });

  it("Should pause and unpause contract correctly", async () => {
    await expect(batches.connect(owner).setPaused(true)).to.emit(
      batches,
      "Paused"
    );

    await expect(
      batches.connect(farmer).createBatch("Test", "cid", ethers.id("data"), 0)
    ).to.be.revertedWith("CONTRACT_PAUSED");

    await batches.connect(owner).setPaused(false);

    await batches
      .connect(farmer)
      .createBatch("Test", "cid", ethers.id("Batch-014"), 0);
    const batch = await batches.getBatch(1);
    expect(batch.id).to.equal(1n);
  });
});
