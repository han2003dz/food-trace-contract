import { expect } from "chai";
import { network } from "hardhat";
const { ethers } = await network.connect();

describe("AddressBook", function () {
  let addressBook: any;
  let owner: any;
  let other: any;
  let orgs: any, batches: any, certs: any, telemetry: any;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    // Deploy 4 mock contracts thật
    const OrganizationRegistry = await ethers.getContractFactory(
      "OrganizationRegistry"
    );
    orgs = await OrganizationRegistry.deploy();
    await orgs.waitForDeployment();

    const BatchRegistry = await ethers.getContractFactory("BatchRegistry");
    batches = await BatchRegistry.deploy(await orgs.getAddress());
    await batches.waitForDeployment();

    const CertRegistry = await ethers.getContractFactory("CertRegistry");
    certs = await CertRegistry.deploy(await orgs.getAddress());
    await certs.waitForDeployment();

    const TelemetryAnchor = await ethers.getContractFactory("TelemetryAnchor");
    telemetry = await TelemetryAnchor.deploy(await orgs.getAddress());
    await telemetry.waitForDeployment();

    // Deploy AddressBook
    const AddressBook = await ethers.getContractFactory("AddressBook");
    addressBook = await AddressBook.deploy();
    await addressBook.waitForDeployment();
  });

  it("Should link all addresses correctly", async function () {
    const tx = await addressBook
      .connect(owner)
      .link(
        await orgs.getAddress(),
        await batches.getAddress(),
        await certs.getAddress(),
        await telemetry.getAddress()
      );
    await tx.wait();

    // Check linked addresses
    expect(await addressBook.orgs()).to.equal(await orgs.getAddress());
    expect(await addressBook.batches()).to.equal(await batches.getAddress());
    expect(await addressBook.certs()).to.equal(await certs.getAddress());
    expect(await addressBook.telemetry()).to.equal(
      await telemetry.getAddress()
    );
  });

  it("Should revert if any address is zero", async function () {
    await expect(
      addressBook
        .connect(owner)
        .link(
          ethers.ZeroAddress,
          await batches.getAddress(),
          await certs.getAddress(),
          await telemetry.getAddress()
        )
    ).to.be.revertedWith("ZERO_ADDR");
  });

  it("Should revert if called by non-owner", async function () {
    await expect(
      addressBook
        .connect(other)
        .link(
          await orgs.getAddress(),
          await batches.getAddress(),
          await certs.getAddress(),
          await telemetry.getAddress()
        )
    ).to.be.revertedWith("NOT_OWNER");
  });
});
