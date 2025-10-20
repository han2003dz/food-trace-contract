import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import OrganizationRegistryModule from "./OrganizationRegistry.js";
import BatchRegistryModule from "./BatchRegistry.js";
import CertRegistryModule from "./CertRegistry.js";
import TelemetryAnchorModule from "./TelemetryAnchor.js";

const AddressBookModule = buildModule("AddressBookModule", (m) => {
  const { organizationRegistry } = m.useModule(OrganizationRegistryModule);
  const { batchRegistry } = m.useModule(BatchRegistryModule);
  const { certRegistry } = m.useModule(CertRegistryModule);
  const { telemetryAnchor } = m.useModule(TelemetryAnchorModule);

  const addressBook = m.contract("AddressBook");

  m.call(addressBook, "link", [
    organizationRegistry,
    batchRegistry,
    certRegistry,
    telemetryAnchor,
  ]);

  return { addressBook };
});

export default AddressBookModule;
