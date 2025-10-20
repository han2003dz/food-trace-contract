import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const OrganizationRegistryModule = buildModule(
  "OrganizationRegistryModule",
  (m) => {
    const organizationRegistry = m.contract("OrganizationRegistry");

    return { organizationRegistry };
  }
);

export default OrganizationRegistryModule;
