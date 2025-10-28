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
  });

  it("should allow owner to set new committer", async function () {
    const newCommitter = other;
    await contract.setCommitter(newCommitter.address);
    expect(await contract.committer()).to.equal(newCommitter.address);
  });

  it("should revert if non-owner tries to set committer", async function () {
    await expect(
      contract.connect(committer).setCommitter(other.address)
    ).to.be.revertedWithCustomError(contract, "Unauthorized");
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
