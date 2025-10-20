import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import OrganizationRegistryModule from "./OrganizationRegistry.js";

const BatchRegistryModule = buildModule("BatchRegistryModule", (m) => {
  const { organizationRegistry } = m.useModule(OrganizationRegistryModule);

  const batchRegistry = m.contract("BatchRegistry", [organizationRegistry]);

  return { batchRegistry };
});

export default BatchRegistryModule;
