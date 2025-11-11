import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import * as dotenv from "dotenv";
dotenv.config();

/**
 * TraceabilityModule
 * Deploy contract TraceabilityRegistry (new version)
 */
const TraceabilityModule = buildModule("TraceabilityRegistryModule", (m) => {
  const registry = m.contract("TraceabilityMerkleRegistry", []);

  m.call(registry, "owner", [], {
    id: "check_owner",
    after: [registry],
  });

  m.call(registry, "paused", [], {
    id: "check_paused",
    after: [registry],
  });

  return { registry };
});

export default TraceabilityModule;
