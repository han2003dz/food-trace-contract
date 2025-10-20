import { network } from "hardhat";

import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const { ethers } = await network.connect({
    network: "hardhatOp",
    chainType: "op",
  });
  const [deployer] = await ethers.getSigners();
  console.log(`👷 Deployer: ${deployer.address}`);

  // ======= ĐỊA CHỈ CONTRACT TRÊN BSC TESTNET =======
  const addressBookAddr = "0x5b61AfA3ab03c834D57026BF386FD73c1F30a809";
  const orgsAddr = "0x002938CE9D470273ea8D9E14E6aBbA6928F804A9";
  const batchesAddr = "0xf7bb6869f9eA7c2C54EDFa70fC89538A2d2aeA65";
  const certsAddr = "0x6AC2192dA4b1657591f2A7cB3aFD2eCb868c997a";
  const telemetryAddr = "0xEAF1E45A9E2a3Fceef5a3713bD9aDEe4EB3Db66A";

  // ======= KẾT NỐI CONTRACT =======
  const orgs = await ethers.getContractAt("OrganizationRegistry", orgsAddr);
  const batches = await ethers.getContractAt("BatchRegistry", batchesAddr);
  const certs = await ethers.getContractAt("CertRegistry", certsAddr);
  const telemetry = await ethers.getContractAt(
    "TelemetryAnchor",
    telemetryAddr
  );

  console.log("orgs", orgs);

  console.log("✅ Connected to all contracts!");

  // ======= 1️⃣ SEED 5 ORGANIZATIONS =======
  const organizations = [
    { name: "FreshFarm", role: "Farmer", location: "Cần Thơ" },
    { name: "VietProcessing Co.", role: "Processor", location: "Đồng Nai" },
    { name: "GreenDistributors", role: "Distributor", location: "TP. HCM" },
    { name: "EcoRetail", role: "Retailer", location: "Hà Nội" },
    { name: "SafeFoodAudit", role: "Auditor", location: "Huế" },
  ];

  console.log("🌱 Seeding Organizations...");
  for (const org of organizations) {
    console.log("orgs", org);
    const tx = await orgs.registerOrganization(
      org.name,
      org.role,
      org.location
    );
    await tx.wait();
    console.log(`   → ${org.name} (${org.role}) created`);
  }

  // ======= 2️⃣ SEED BATCHES =======
  console.log("📦 Seeding Product Batches...");
  const tx1 = await batches.createBatch(
    "Organic Mango",
    "Batch-001",
    "2025-10-01",
    "2025-10-10",
    "Cần Thơ"
  );
  await tx1.wait();

  const tx2 = await batches.createBatch(
    "Green Tea",
    "Batch-002",
    "2025-09-01",
    "2025-09-15",
    "Lâm Đồng"
  );
  await tx2.wait();

  console.log("   → 2 product batches created");

  // ======= 3️⃣ SEED CERTIFICATE =======
  console.log("📜 Seeding Certificate...");
  const certTx = await certs.issueCertificate(
    "ISO22000",
    "International Food Safety",
    "SafeFoodAudit",
    "2025-12-31"
  );
  await certTx.wait();
  console.log("   → Certificate ISO22000 issued");

  // ======= 4️⃣ SEED TELEMETRY DATA =======
  console.log("📡 Seeding Telemetry Data...");
  const telemetryTx = await telemetry.recordTelemetry(
    "Batch-001",
    23.5, // temperature °C
    68, // humidity %
    "10.762622,106.660172" // location (HCM)
  );
  await telemetryTx.wait();
  console.log("   → Telemetry record saved for Batch-001");

  console.log("\n🎉 SEED DEMO COMPLETED SUCCESSFULLY!");
  console.log("===================================");
  console.log("OrganizationRegistry:", orgsAddr);
  console.log("BatchRegistry:", batchesAddr);
  console.log("CertRegistry:", certsAddr);
  console.log("TelemetryAnchor:", telemetryAddr);
  console.log("AddressBook:", addressBookAddr);
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
