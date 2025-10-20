import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import OrganizationRegistryModule from "./OrganizationRegistry.js";

const TelemetryAnchorModule = buildModule("TelemetryAnchorModule", (m) => {
  const { organizationRegistry } = m.useModule(OrganizationRegistryModule);
  const telemetryAnchor = m.contract("TelemetryAnchor", [organizationRegistry]);
  return { telemetryAnchor };
});

export default TelemetryAnchorModule;
