import { expect } from "chai";
import { network } from "hardhat";
const { ethers } = await network.connect();

describe("TraceabilityMerkleRegistry", function () {
  let deployer: any;
  let committer: any;
  let other: any;
  let contract: any;

  beforeEach("Deploy contract before each test", async function () {
    [deployer, committer, other] = await ethers.getSigners();

    const Factory = await ethers.getContractFactory(
      "TraceabilityMerkleRegistry"
    );
    contract = await Factory.deploy(committer.address);
    await contract.waitForDeployment();
  });

  it("should set correct owner and committer at deployment", async function () {
    expect(await contract.owner()).to.equal(deployer.address);
    expect(await contract.committer()).to.equal(committer.address);
    expect(await contract.allowedCommitters(committer.address)).to.equal(true);
  });

  it("should allow owner to set new committer", async function () {
    const newCommitter = other;
    await contract.setCommitter(newCommitter.address);
    expect(await contract.committer()).to.equal(newCommitter.address);
    expect(await contract.allowedCommitters(newCommitter.address)).to.equal(
      true
    );
  });

  it("should revert if non-owner tries to set committer", async function () {
    await expect(
      contract.connect(committer).setCommitter(other.address)
    ).to.be.revertedWithCustomError(contract, "Unauthorized");
  });

  it("should allow owner to add and remove allowed committers", async function () {
    await contract.addCommitter(other.address);
    expect(await contract.allowedCommitters(other.address)).to.equal(true);

    await contract.removeCommitter(other.address);
    expect(await contract.allowedCommitters(other.address)).to.equal(false);
  });

  it("should allow committer to commit a valid Merkle root", async function () {
    const root = ethers.keccak256(ethers.toUtf8Bytes("root#1"));
    await contract.connect(committer).commitMerkleRoot(root, 1, 10);

    const total = await contract.totalBatches();
    expect(total).to.equal(1n);

    const batch = await contract.batches(1);
    expect(batch.root).to.equal(root);
    expect(batch.committer).to.equal(committer.address);
  });

  it("should revert when committing invalid range", async function () {
    const root = ethers.keccak256(ethers.toUtf8Bytes("root#badrange"));
    await expect(
      contract.connect(committer).commitMerkleRoot(root, 10, 1)
    ).to.be.revertedWithCustomError(contract, "InvalidRange");
  });

  it("should revert if same root committed twice", async function () {
    const root = ethers.keccak256(ethers.toUtf8Bytes("root#dupe"));
    await contract.connect(committer).commitMerkleRoot(root, 1, 5);
    await expect(
      contract.connect(committer).commitMerkleRoot(root, 6, 10)
    ).to.be.revertedWithCustomError(contract, "RootAlreadyCommitted");
  });

  it("should pause and unpause only by owner", async function () {
    await contract.pause();
    expect(await contract.paused()).to.equal(true);

    await contract.unpause();
    expect(await contract.paused()).to.equal(false);

    await expect(contract.connect(other).pause()).to.be.revertedWithCustomError(
      contract,
      "Unauthorized"
    );
  });

  it("should allow commit with batchCode", async function () {
    const root = ethers.keccak256(ethers.toUtf8Bytes("root#batch"));
    const batchCode = "LOT-COFFEE-BMT-2025-001";

    const tx = await contract
      .connect(committer)
      .commitWithBatchCode(root, 1, 3, batchCode);

    await expect(tx)
      .to.emit(contract, "BatchCodeBound")
      .withArgs(ethers.keccak256(ethers.toUtf8Bytes(batchCode)), 1n, batchCode);

    const ids = await contract.getBatchIdsByBatchCode(batchCode);
    expect(ids.length).to.equal(1);
    expect(ids[0]).to.equal(1n);
  });

  it("should revert bindBatchCode if batch does not exist", async function () {
    await expect(
      contract.connect(committer).bindBatchCode(999, "LOT-NOPE-001")
    ).to.be.revertedWithCustomError(contract, "BatchNotFound");
  });

  // it("should revert if batchCode is empty", async function () {
  //   const root = ethers.keccak256(ethers.toUtf8Bytes("root#empty"));
  //   await contract.connect(committer).commitMerkleRoot(root, 1, 5);

  //   await expect(
  //     contract.connect(committer).bindBatchCode(1, "")
  //   ).to.be.revertedWithCustomError(contract, "EmptyBatchCode");
  // });

  it("should pause and unpause only by owner", async function () {
    await contract.pause();
    expect(await contract.paused()).to.equal(true);

    await contract.unpause();
    expect(await contract.paused()).to.equal(false);

    await expect(contract.connect(other).pause()).to.be.revertedWithCustomError(
      contract,
      "Unauthorized"
    );
  });

  it("should prevent commit when paused", async function () {
    await contract.pause();

    const root = ethers.keccak256(ethers.toUtf8Bytes("root#paused"));
    await expect(
      contract.connect(committer).commitMerkleRoot(root, 1, 2)
    ).to.be.revertedWithCustomError(contract, "Unauthorized");
  });
});
