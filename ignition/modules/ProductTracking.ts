import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ProductTrackingModule = buildModule("ProductTrackingModule", (m) => {
  const productTracking = m.contract("ProductTracking");

  return { productTracking };
});

export default ProductTrackingModule;
