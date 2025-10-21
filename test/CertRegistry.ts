import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("CertRegistry", function () {
  let orgs: any;
  let certs: any;
  let owner: any;
  let auditor: any;
  let farmer: any;

  beforeEach("CertRegistry deployment", async () => {
    [owner, auditor, farmer] = await ethers.getSigners();

    const OrganizationRegistry = await ethers.getContractFactory(
      "OrganizationRegistry"
    );
    orgs = await OrganizationRegistry.deploy();
    await orgs.waitForDeployment();

    // deploy CertRegistry
    const CertRegistry = await ethers.getContractFactory("CertRegistry");
    certs = await CertRegistry.deploy(await orgs.getAddress());
    await certs.waitForDeployment();

    // register organizations
    await orgs
      .connect(owner)
      .registerOrganization(
        auditor.address,
        5,
        "AuditorOrg",
        "cid-auditor",
        true
      ); // OrgType.AUDITOR = 3
    await orgs
      .connect(owner)
      .registerOrganization(farmer.address, 1, "FarmOrg", "cid-farmer", true);
  });

  it("Should issue certificate correctly by auditor", async () => {
    const subject = ethers.id("Batch-001");
    const metadataCid = "cid-cert-batch";
    const expireAt = Math.floor(Date.now() / 1000) + 3600; // 1h

    const tx = await certs
      .connect(auditor)
      .issueCert(subject, metadataCid, expireAt);
    await tx.wait();

    const cert = await certs.getCert(1);
    expect(cert.id).to.equal(1n);
    expect(cert.issuerOrgId).to.equal(1n);
    expect(cert.metadataCid).to.equal(metadataCid);
    expect(cert.active).to.equal(true);
  });

  it("Should revert if non-auditor issues cert", async () => {
    const subject = ethers.id("Batch-002");
    await expect(
      certs.connect(farmer).issueCert(subject, "cid", 9999999999)
    ).to.be.revertedWith("ORG_NOT_AUTHORIZED_AS_AUDITOR");
  });

  it("Should revoke certificate correctly", async function () {
    const subject = ethers.id("Batch-1003");
    await certs.connect(auditor).issueCert(subject, "cid-revoke", 9999999);

    const tx = await certs.connect(auditor).revokeCert(1);
    await tx.wait();

    const cert = await certs.getCert(1);
    expect(cert.active).to.equal(false);
  });

  it("Should revert if revoking cert not found", async function () {
    await expect(certs.connect(auditor).revokeCert(99)).to.be.revertedWith(
      "CERT_NOT_FOUND"
    );
  });

  it("Should revert if revoking cert from other auditor", async function () {
    // setup another auditor
    const [, , , anotherAuditor] = await ethers.getSigners();
    await orgs
      .connect(owner)
      .registerOrganization(
        anotherAuditor.address,
        5,
        "AuditorB",
        "cid-b",
        true
      );

    const subject = ethers.id("Batch-1004");
    await certs.connect(auditor).issueCert(subject, "cid-cert", 9999999);

    await expect(
      certs.connect(anotherAuditor).revokeCert(1)
    ).to.be.revertedWith("NOT_AUTHORIZED_TO_REVOKE_CERT");
  });
});
