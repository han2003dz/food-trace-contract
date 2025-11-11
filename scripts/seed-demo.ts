import { network } from "hardhat";
const { ethers } = await network.connect();
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const CONTRACT_ADDRESS = "0xab17fEcAba71cce55253D8dBD03709209c5809E7";
  const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
  const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "";

  if (!PRIVATE_KEY || !RPC_URL) {
    throw new Error("⚠️ Missing PRIVATE_KEY or BASE_SEPOLIA_RPC_URL in .env");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  // ✅ Load ABI đúng contract mới
  const abi = await import(
    "../artifacts/contracts/TraceabilityMerkleRegistry.sol/TraceabilityMerkleRegistry.json"
  );
  const registry = new ethers.Contract(
    CONTRACT_ADDRESS,
    abi.default.abi,
    wallet
  );

  console.log(`✅ Connected as ${wallet.address}`);

  // ======= ROLE CONSTANTS =======
  const ROLE_PRODUCER = 1 << 0;
  const ROLE_AUDITOR = 1 << 4;

  // ======= STEP 1: Assign roles =======
  console.log("\n⚙️ Setting roles...");
  const rolesTx = await registry.setRoles(
    wallet.address,
    ROLE_PRODUCER | ROLE_AUDITOR
  );
  await rolesTx.wait();
  console.log("✅ Roles assigned (PRODUCER + AUDITOR)");

  // ======= STEP 2: Create products =======
  console.log("\n🌿 Creating demo products...");
  const products = [
    { name: "Rau Đà Lạt Hữu Cơ", metadataURI: "ipfs://QmRauDaLat" },
    { name: "Trà Thái Nguyên Xanh", metadataURI: "ipfs://QmTraThaiNguyen" },
    { name: "Cà Phê Buôn Ma Thuột", metadataURI: "ipfs://QmCaPheBMT" },
  ];

  for (const p of products) {
    const tx = await registry.createProduct(p.name, p.metadataURI);
    await tx.wait();
    console.log(`✅ Product created: ${p.name}`);
  }

  // ======= STEP 3: Create batches =======
  console.log("\n📦 Creating batches...");
  const batches = [
    {
      productId: 1,
      batchCode: "LOT-RAU-DA-LAT-2025-002",
      hash: ethers.keccak256(ethers.toUtf8Bytes("batch-raudalat-2025")),
    },
    {
      productId: 2,
      batchCode: "LOT-TRA-THAI-NGUYEN-2025-001",
      hash: ethers.keccak256(ethers.toUtf8Bytes("batch-trathai-2025")),
    },
    {
      productId: 3,
      batchCode: "LOT-CA-PHE-BMT-2025-004",
      hash: ethers.keccak256(ethers.toUtf8Bytes("batch-caphe-2025")),
    },
  ];

  for (const b of batches) {
    console.log(`\n⏳ Creating batch for ${b.batchCode}...`);
    const tx = await registry.createBatch(b.productId, b.hash);
    const receipt = await tx.wait();

    // 🔹 Lấy batchId chính xác từ event
    const createdEvent = receipt.logs.find(
      (log: any) => log.fragment && log.fragment.name === "BatchCreated"
    );
    const batchId = createdEvent?.args?.batchId ?? createdEvent?.args?.[0];
    console.log(`✅ Batch created for ${b.batchCode} (ID: ${batchId})`);

    // 🔹 Kiểm tra batch code trùng
    const codeHash = ethers.keccak256(ethers.toUtf8Bytes(b.batchCode));
    const existing = await registry.batchCodeHashToBatchId(codeHash);
    if (existing != 0n) {
      console.log(
        `⚠️ Batch code already exists (${b.batchCode}), skipping bind`
      );
      continue;
    }

    // 🔹 Bind batch code

    const batch = await registry.batches(batchId);
    console.log({
      caller: wallet.address,
      owner: await registry.owner(),
      creator: batch.creator,
      currentOwner: batch.currentOwner,
    });

    const txBind = await registry.bindBatchCode(batchId, b.batchCode);
    await txBind.wait();
    console.log(`🔗 Bound batchCode: ${b.batchCode}`);
  }

  // ======= STEP 4: Record events for first batch =======
  console.log("\n🧾 Recording trace events...");
  const EventType = {
    Created: 0,
    Processed: 1,
    Shipped: 2,
    Received: 3,
    Stored: 4,
    Sold: 5,
    Recalled: 6,
  };

  const eventHash = ethers.keccak256(ethers.toUtf8Bytes("process-event-demo"));
  const txEvent = await registry.recordTraceEvent(
    1,
    EventType.Processed,
    eventHash
  );
  await txEvent.wait();
  console.log("✅ Added Processed event to batch 1");

  // ======= STEP 5: Commit Merkle root for audit =======
  console.log("\n🔐 Committing Merkle root for batch 1...");
  const root = ethers.keccak256(ethers.toUtf8Bytes("MERKLE_ROOT_BATCH_1"));
  const txRoot = await registry.commitBatchMerkleRoot(1, root);
  await txRoot.wait();
  console.log("✅ Merkle root committed:", root);

  console.log("\n🎉 Demo seeding completed successfully!");
}

main().catch((err) => {
  console.error("❌ Error seeding data:", err);
  process.exit(1);
});
