import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("BatchRegistry (with Fee System)", function () {
  let orgs: any;
  let batches: any;
  let owner: any;
  let farmer: any;
  let processor: any;

  beforeEach("deploy contracts", async function () {
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

  // ============================
  // ✅ FEE TESTS
  // ============================
  it("Should require fee when creating batch", async () => {
    const fee = await batches.feeCreateBatch();

    // Gửi thiếu fee
    await expect(
      batches
        .connect(farmer)
        .createBatch("Apple", "cid-apple", ethers.id("Batch-001"), 0, {
          value: ethers.parseEther("0.0001"),
        })
    ).to.be.revertedWith("INSUFFICIENT_FEE");

    // Gửi đúng fee
    await expect(
      batches
        .connect(farmer)
        .createBatch("Apple", "cid-apple", ethers.id("Batch-001"), 0, {
          value: fee,
        })
    ).to.emit(batches, "FeePaid");
  });

  it("Should accumulate total fees and track per user", async () => {
    const fee = await batches.feeCreateBatch();
    await batches
      .connect(farmer)
      .createBatch("Mango", "cid-mango", ethers.id("Batch-002"), 0, {
        value: fee,
      });
    await batches
      .connect(farmer)
      .createBatch("Banana", "cid-banana", ethers.id("Batch-003"), 0, {
        value: fee,
      });

    const total = await batches.totalFeeCollected();
    const userPaid = await batches.userFees(farmer.address);

    expect(total).to.equal(fee * 2n);
    expect(userPaid).to.equal(fee * 2n);
  });

  it("Should allow owner to update fee", async () => {
    const newFee = ethers.parseEther("0.005");
    await expect(batches.connect(owner).setFee(newFee))
      .to.emit(batches, "FeeUpdated")
      .withArgs(newFee);

    const updated = await batches.feeCreateBatch();
    expect(updated).to.equal(newFee);
  });

  it("Should allow owner to withdraw collected fees", async () => {
    const fee = ethers.parseEther("0.001");
    await batches
      .connect(farmer)
      .createBatch("Test", "cid-test", ethers.id("Batch-200"), 0, {
        value: fee,
      });

    const contractBalance = await batches.getContractBalance();
    expect(contractBalance).to.equal(fee);

    await batches.connect(owner).withdrawFees(owner.address, fee);

    const newBalance = await batches.getContractBalance();
    expect(newBalance).to.equal(0n);
  });

  it("Should show correct contract balance", async () => {
    const fee = await batches.feeCreateBatch();

    await batches
      .connect(farmer)
      .createBatch("Tomato", "cid-tomato", ethers.id("Batch-005"), 0, {
        value: fee,
      });

    const balance = await batches.getContractBalance();
    expect(balance).to.equal(fee);
  });

  // ============================
  // ✅ CORE FUNCTIONAL TESTS
  // ============================

  it("Should create a new batch correctly", async () => {
    const fee = await batches.feeCreateBatch();
    const tx = await batches
      .connect(farmer)
      .createBatch("Organic Apples", "cid-apple", ethers.id("Batch-001"), 0, {
        value: fee,
      });

    await tx.wait();
    const batch = await batches.getBatch(1);
    expect(batch.id).to.equal(1n);
    expect(batch.ownerOrgId).to.equal(1n);
    expect(batch.productType).to.equal("Organic Apples");
  });

  it("Should revert if transferring to inactive org", async () => {
    const fee = await batches.feeCreateBatch();
    await batches
      .connect(farmer)
      .createBatch("Pineapple", "cid-pine", ethers.id("Batch-003"), 0, {
        value: fee,
      });

    await orgs
      .connect(owner)
      .updateOrganization(2, processor.address, 2, "Proc", "cid", false);

    await expect(
      batches.connect(farmer).transferBatchOwner(1, 2)
    ).to.be.revertedWith("TARGET_INACTIVE");
  });

  it("Should update batch status correctly", async () => {
    const fee = await batches.feeCreateBatch();
    await batches
      .connect(farmer)
      .createBatch("Mango", "cid-mango", ethers.id("Batch-004"), 0, {
        value: fee,
      });

    await expect(batches.connect(farmer).updateBatchStatus(1, 1)).to.emit(
      batches,
      "BatchStatusUpdated"
    );
  });

  it("Should revert if rollback batch status", async () => {
    const fee = await batches.feeCreateBatch();
    await batches
      .connect(farmer)
      .createBatch("Apple", "cid-apple", ethers.id("Batch-005"), 0, {
        value: fee,
      });

    await batches.connect(farmer).updateBatchStatus(1, 1);

    await expect(
      batches.connect(farmer).updateBatchStatus(1, 0)
    ).to.be.revertedWith("INVALID_STATE_BACKWARD");
  });

  it("Should split batch into children", async () => {
    const fee = await batches.feeCreateBatch();
    await batches
      .connect(farmer)
      .createBatch("Apple", "cid-apple", ethers.id("Batch-006"), 0, {
        value: fee,
      });

    const tx = await batches.connect(farmer).splitBatch(1, 3);
    await tx.wait();
    const children = await batches.getChildren(1);
    expect(children.length).to.equal(3);
  });

  it("Should revert if split count invalid", async () => {
    const fee = await batches.feeCreateBatch();
    await batches
      .connect(farmer)
      .createBatch("Apple", "cid-apple", ethers.id("Batch-007"), 0, {
        value: fee,
      });

    await expect(batches.connect(farmer).splitBatch(1, 0)).to.be.revertedWith(
      "BAD_COUNT"
    );
  });

  it("Should merge batches correctly", async () => {
    const fee = await batches.feeCreateBatch();
    await Promise.all([
      batches
        .connect(farmer)
        .createBatch("Apple", "cid-apple-1", ethers.id("Batch-007"), 0, {
          value: fee,
        }),
      batches
        .connect(farmer)
        .createBatch("Apple", "cid-apple-2", ethers.id("Batch-008"), 0, {
          value: fee,
        }),
    ]);

    const sources = [1, 2];
    await batches
      .connect(farmer)
      .mergeBatches(sources, "Mixed", "cid-merged", ethers.id("Batch-009"));

    const merged = await batches.getBatch(3);
    expect(merged.productType).to.equal("Mixed");
  });

  it("Should append event correctly", async () => {
    const fee = await batches.feeCreateBatch();
    await batches
      .connect(farmer)
      .createBatch("Apple", "cid-apple", ethers.id("Batch-011"), 0, {
        value: fee,
      });

    await batches
      .connect(farmer)
      .appendEvent(1, 1, "cid-process", ethers.id("Batch-012"));
    await batches
      .connect(farmer)
      .appendEvent(1, 2, "cid-pack", ethers.id("Batch-013"));

    const events = await batches.getEvents(1);
    expect(events.length).to.equal(2);
    expect(events[1].metadataCid).to.equal("cid-pack");
  });

  it("Should revert if appending to non-existing batch", async () => {
    await expect(
      batches.connect(farmer).appendEvent(999, 1, "cid", ethers.id("data"))
    ).to.be.revertedWith("BATCH_NOT_FOUND");
  });

  it("Should pause/unpause contract correctly", async () => {
    await expect(batches.connect(owner).setPaused(true)).to.emit(
      batches,
      "Paused"
    );
    await expect(
      batches.connect(farmer).createBatch("Test", "cid", ethers.id("data"), 0, {
        value: ethers.parseEther("0.001"),
      })
    ).to.be.revertedWith("CONTRACT_PAUSED");
  });
});
