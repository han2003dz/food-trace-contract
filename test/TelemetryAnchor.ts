import { expect } from "chai";
import { network } from "hardhat";
const { ethers } = await network.connect();

describe("TelemetryAnchor", function () {
  let orgs: any;
  let telemetry: any;
  let owner: any;
  let farmer: any;

  beforeEach(async function () {
    [owner, farmer] = await ethers.getSigners();

    // Deploy OrganizationRegistry
    const OrganizationRegistry = await ethers.getContractFactory(
      "OrganizationRegistry"
    );
    orgs = await OrganizationRegistry.deploy();
    await orgs.waitForDeployment();

    // Deploy TelemetryAnchor
    const TelemetryAnchor = await ethers.getContractFactory("TelemetryAnchor");
    telemetry = await TelemetryAnchor.deploy(await orgs.getAddress());
    await telemetry.waitForDeployment();

    // Register organization as active FARMER (orgType = 1)
    await orgs
      .connect(owner)
      .registerOrganization(farmer.address, 1, "FarmA", "cid-farmA", true);
  });

  it("✅ Should anchor telemetry correctly", async function () {
    const now = Math.floor(Date.now() / 1000);
    const tx = await telemetry.connect(farmer).anchor(
      ethers.id("temp:25C-humid:90%"),
      1, // refType = Batch
      101, // refId = batchId
      now,
      now + 3600,
      "ipfs://cid-telemetry-001"
    );
    await tx.wait();

    const anchor = await telemetry.get(1);
    expect(anchor.id).to.equal(1n);
    expect(anchor.refId).to.equal(101n);
    expect(anchor.refType).to.equal(1);
    expect(anchor.actorOrgId).to.equal(1n);
    expect(anchor.storageUri).to.equal("ipfs://cid-telemetry-001");
  });

  it("❌ Should revert if root is zero", async function () {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      telemetry.connect(farmer).anchor(
        ethers.ZeroHash, // root = 0
        1,
        100,
        now,
        now + 10,
        "cid-zero"
      )
    ).to.be.revertedWith("ROOT_ZERO");
  });

  it("❌ Should revert if refType invalid", async function () {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      telemetry.connect(farmer).anchor(
        ethers.id("data"),
        99, // invalid refType
        10,
        now,
        now + 100,
        "cid-invalid"
      )
    ).to.be.revertedWith("BAD_REFTYPE");
  });

  it("❌ Should revert if fromTs > toTs", async function () {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      telemetry
        .connect(farmer)
        .anchor(ethers.id("data"), 1, 1, now + 100, now, "cid-badtime")
    ).to.be.revertedWith("BAD_RANGE");
  });

  it("❌ Should revert if org inactive", async function () {
    // deactivate farmer org
    await orgs
      .connect(owner)
      .updateOrganization(1, farmer.address, 1, "FarmA", "cid-farmA", false);

    const now = Math.floor(Date.now() / 1000);
    await expect(
      telemetry
        .connect(farmer)
        .anchor(ethers.id("data"), 1, 1, now, now + 60, "cid-inactive")
    ).to.be.revertedWith("ORG_INACTIVE");
  });

  it("✅ Should fetch anchors by ref correctly", async function () {
    const now = Math.floor(Date.now() / 1000);

    await telemetry
      .connect(farmer)
      .anchor(ethers.id("data1"), 1, 500, now, now + 60, "cid-1");

    await telemetry
      .connect(farmer)
      .anchor(ethers.id("data2"), 1, 500, now, now + 120, "cid-2");

    const list = await telemetry.getByRef(1, 500);
    expect(list.length).to.equal(2);
    expect(list[0].storageUri).to.equal("cid-1");
    expect(list[1].storageUri).to.equal("cid-2");
  });
});
