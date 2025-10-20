import { network } from "hardhat";

const { ethers } = await network.connect({
  network: "hardhatOp",
  chainType: "op",
});
import { mkdirSync, writeFileSync } from "fs";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const OrganizationRegistry = await ethers.getContractFactory("OrganizationRegistry");
  const orgs = await OrganizationRegistry.deploy();
  await orgs.waitForDeployment();
  console.log("✅ OrganizationRegistry:", await orgs.getAddress());

  const BatchRegistry = await ethers.getContractFactory("BatchRegistry");
  const batches = await BatchRegistry.deploy(await orgs.getAddress());
  await batches.waitForDeployment();
  console.log("✅ BatchRegistry:", await batches.getAddress());

  const CertRegistry = await ethers.getContractFactory("CertRegistry");
  const certs = await CertRegistry.deploy(await orgs.getAddress());
  await certs.waitForDeployment();
  console.log("✅ CertRegistry:", await certs.getAddress());

  const TelemetryAnchor = await ethers.getContractFactory("TelemetryAnchor");
  const telemetry = await TelemetryAnchor.deploy(await orgs.getAddress());
  await telemetry.waitForDeployment();
  console.log("✅ TelemetryAnchor:", await telemetry.getAddress());

  const AddressBook = await ethers.getContractFactory("AddressBook");
  const addressBook = await AddressBook.deploy();
  await addressBook.waitForDeployment();
  console.log("✅ AddressBook:", await addressBook.getAddress());

  // ghi file .deploy/addressbook.json
  mkdirSync(".deploy", { recursive: true });
  writeFileSync(
    ".deploy/addressbook.json",
    JSON.stringify({
      AddressBook: await addressBook.getAddress(),
      OrganizationRegistry: await orgs.getAddress(),
      BatchRegistry: await batches.getAddress(),
      CertRegistry: await certs.getAddress(),
      TelemetryAnchor: await telemetry.getAddress(),
    }, null, 2)
  );

  console.log("🎉 All contracts deployed successfully!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
