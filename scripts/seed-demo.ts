import { network } from "hardhat";
const { ethers } = await network.connect();
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const CONTRACT_ADDRESS = "0x9907944Fcd4a7CD538feBB3a70367F5828506C3d";
  const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
  const RPC_URL = process.env.BASE_SEPOLIA_RPC_URL || "";

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const abi = await import(
    "../artifacts/contracts/TraceabilityMerkleRegistry.sol/TraceabilityMerkleRegistry.json"
  );
  const registry = new ethers.Contract(
    CONTRACT_ADDRESS,
    abi.default.abi,
    wallet
  );

  console.log("Connected as:", wallet.address);

  const sampleBatches = [
    {
      merkleRoot: ethers.keccak256(ethers.toUtf8Bytes("BATCH_001")),
      fromEventId: 1,
      toEventId: 10,
      batchCode: "LOT-RAU-DA-LAT-2025-001",
    },
    {
      merkleRoot: ethers.keccak256(ethers.toUtf8Bytes("BATCH_002")),
      fromEventId: 11,
      toEventId: 25,
      batchCode: "LOT-TRA-THAI-NGUYEN-2025-002",
    },
    {
      merkleRoot: ethers.keccak256(ethers.toUtf8Bytes("BATCH_003")),
      fromEventId: 26,
      toEventId: 40,
      batchCode: "LOT-CA-PHE-BUON-MA-THUOT-2025-003",
    },
  ];

  for (const b of sampleBatches) {
    console.log(`\n⏳ Committing batch code: ${b.batchCode}`);
    const tx = await registry.commitWithBatchCode(
      b.merkleRoot,
      b.fromEventId,
      b.toEventId,
      b.batchCode
    );
    await tx.wait();
    console.log(`✅ Batch ${b.batchCode} committed. TX: ${tx.hash}`);
  }

  const total = await registry.totalBatches();
  console.log(`\n📦 Total batches now: ${total}`);

  const lastBatch = await registry.getBatch(total);
  console.log(`\n🧾 Last batch detail:`);
  console.log({
    root: lastBatch.root,
    from: lastBatch.fromEventId,
    to: lastBatch.toEventId,
    committer: lastBatch.committer,
    timestamp: new Date(Number(lastBatch.timestamp) * 1000).toISOString(),
  });
}

main().catch((err) => {
  console.error("❌ Error seeding data:", err);
  process.exit(1);
});
