import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import OrganizationRegistryModule from "./OrganizationRegistry.js";

const CertRegistryModule = buildModule("CertRegistryModule", (m) => {
  const { organizationRegistry } = m.useModule(OrganizationRegistryModule);
  const certRegistry = m.contract("CertRegistry", [organizationRegistry]);
  return { certRegistry };
});

export default CertRegistryModule;
