import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("OrganizationRegistry", function () {
  let orgs: any;
  let wallet1: any;
  let wallet2: any;
  let owner: any;

  beforeEach("OrganizationRegistry deployment", async function () {
    [owner, wallet1, wallet2] = await ethers.getSigners();

    const OrganizationRegistry = await ethers.getContractFactory(
      "OrganizationRegistry"
    );
    orgs = await OrganizationRegistry.deploy();
    await orgs.waitForDeployment();
  });

  it("Should register a new organization correctly", async () => {
    const orgType = 1;
    const name = "FreshFarm";
    const metadataCid = "QmXoyp4y57PTFmhCaXpW5r8h1HESXJ7g3fD1Z5d2Q1mXWo";
    const active = true;

    const tx = await orgs
      .connect(owner)
      .registerOrganization(
        wallet1.address,
        orgType,
        name,
        metadataCid,
        active
      );
    await tx.wait();

    const org = await orgs.getOrganization(1);
    expect(org.id).to.equal(1n);
    expect(org.wallet).to.equal(wallet1.address);
    expect(org.orgType).to.equal(orgType);
    expect(org.name).to.equal(name);
    expect(org.metadataCid).to.equal(metadataCid);
    expect(org.active).to.equal(active);
  });

  it("Should revert if same wallet registers again", async () => {
    const orgType = 1;
    const name = "FreshFarm";
    const metadataCid = "QmXoyp4y57PTFmhCaXpW5r8h1HESXJ7g3fD1Z5d2Q1mXWo";
    const active = true;
    await orgs
      .connect(owner)
      .registerOrganization(
        wallet1.address,
        orgType,
        name,
        metadataCid,
        active
      );
    await expect(
      orgs
        .connect(owner)
        .registerOrganization(
          wallet1.address,
          orgType,
          name,
          metadataCid,
          active
        )
    ).to.be.revertedWith("ORG_ALREADY_REGISTERED");
  });

  it("Should update organization correctly", async () => {
    const orgType = 1;
    await orgs
      .connect(owner)
      .registerOrganization(wallet1.address, orgType, "Farm A", "cid1", true);

    const newType = 2;
    const newName = "FreshFarm Updated";
    const newMetadataCid = "cid-updated";
    const newActive = false;

    const orgUpdatedTx = await orgs
      .connect(owner)
      .updateOrganization(
        1,
        wallet1.address,
        newType,
        newName,
        newMetadataCid,
        newActive
      );

    await orgUpdatedTx.wait();

    const org = await orgs.getOrganization(1);
    expect(org.orgType).to.equal(newType);
    expect(org.name).to.equal(newName);
    expect(org.metadataCid).to.equal(newMetadataCid);
    expect(org.active).to.equal(newActive);
  });

  it("Should revert if updating non-existing organization", async () => {
    await expect(
      orgs
        .connect(owner)
        .updateOrganization(999, wallet1.address, 1, "NonExistent", "cid", true)
    ).to.be.revertedWith("ORG_NOT_FOUND");
  });

  it("Should reject if invalid wallet or org type", async () => {
    await expect(
      orgs
        .connect(owner)
        .registerOrganization(
          ethers.ZeroAddress,
          1,
          "FARM INVALID WALLET",
          "CID",
          true
        )
    ).to.be.revertedWith("INVALID_WALLET");

    await expect(
      orgs
        .connect(owner)
        .registerOrganization(
          wallet1.address,
          0,
          "FARM INVALID ORG_TYPE",
          "CID",
          true
        )
    ).to.be.revertedWith("INVALID_ORG_TYPE");
  });
});
