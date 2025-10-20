import { Address } from "cluster";
import { writeFileSync, mkdirSync } from "fs";

export function saveAddresses(
  name: string,
  addresses: Record<string, Address>
) {
  mkdirSync(".deploy", { recursive: true });
  writeFileSync(`.deploy/${name}.json`, JSON.stringify(addresses, null, 2));
  console.log("Saved addresses to", `.deploy/${name}.json`);
}
