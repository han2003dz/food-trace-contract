import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import * as dotenv from "dotenv";
dotenv.config();

const TraceabilityModule = buildModule("TraceabilityModule", (m) => {
  const committerFromEnv =
    process.env.COMMITTER_ADDRESS ||
    "0x0000000000000000000000000000000000000000";

  const initialCommitter = m.getParameter("initialCommitter", committerFromEnv);

  const registry = m.contract("TraceabilityMerkleRegistry", [initialCommitter]);

  m.call(registry, "owner", [], {
    id: "owner_check",
    after: [registry],
  });

  m.call(registry, "committer", [], {
    id: "committer_check",
    after: [registry],
  });

  return { registry };
});

export default TraceabilityModule;
