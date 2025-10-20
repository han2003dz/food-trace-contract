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
});
