import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("ProductTracking", function () {
  let contract: any;
  beforeEach("ProductTracking deployment", async function () {
    const ProductTracking = await ethers.getContractFactory("ProductTracking");
    contract = await ProductTracking.deploy();
    await contract.waitForDeployment();
  });

  it("✅ should deploy successfully", async function () {
    const address = await contract.getAddress();
    console.log("Contract deployed to:", address);
    expect(address).to.properAddress;
  });

  it("Should create a new product successfully", async function () {
    const tx = await contract.createProduct(
      "Rau sạch Đà Lạt",
      "Lâm Đồng",
      "2023-10-10",
      "2023-10-20"
    );

    console.log("Transaction hash:", tx.hash);

    // checked event emitted
    await expect(tx)
      .to.emit(contract, "ProductCreated")
      .withArgs(1, "Rau sạch Đà Lạt", "Lâm Đồng");

    const product = await contract.getProduct(1);
    expect(product[0]).to.equal(1n);
    expect(product[1]).to.equal("Rau sạch Đà Lạt");
    expect(product[2]).to.equal("Lâm Đồng");
    expect(product[5]).to.equal("Producer");

    const history = product[6];
    expect(history[0]).to.equal("Created by Producer");
  });

  it("Should update product and change owner correctly", async function () {
    await contract.createProduct(
      "Rau sạch Đà Lạt",
      "Lâm Đồng",
      "2023-10-10",
      "2023-10-20"
    );
    const tx = await contract.updateProduct(1, "Shipping", "Transporter");
    console.log("Transaction hash:", tx.hash);

    await expect(tx)
      .to.emit(contract, "ProductUpdated")
      .withArgs(1, "Shipping", "Transporter");

    const product = await contract.getProduct(1);
    console.log("Product details:", product);
    // Check current owner
    expect(product[5]).to.equal("Transporter");

    // Check history array
    const history = product[6];
    expect(history.length).to.equal(2);
    expect(history[0]).to.equal("Created by Producer");
    expect(history[1]).to.equal("Shipping");
  });

  it("Should store multiple updates correctly", async function () {
    await contract.createProduct(
      "Rau sạch Đà Lạt",
      "Lâm Đồng",
      "2023-10-10",
      "2023-10-20"
    );
    await contract.updateProduct(1, "Shipped to HCM", "Transporter");
    await contract.updateProduct(1, "Arrived at store", "Retailer");
    await contract.updateProduct(1, "Sold to customer", "Customer");
    const product = await contract.getProduct(1);
    const history = product[6];

    expect(history).to.deep.equal([
      "Created by Producer",
      "Shipped to HCM",
      "Arrived at store",
      "Sold to customer",
    ]);
    expect(product[5]).to.equal("Customer");
  });

  it("Should revert if createProduct has missing fields", async function () {
    await expect(
      contract.createProduct("", "Origin", "2025-10-01", "2025-10-30")
    ).to.be.revertedWith("Product name required");

    await expect(
      contract.createProduct("Rau", "", "2025-10-01", "2025-10-30")
    ).to.be.revertedWith("Origin required");
  });

  it("should revert updateProduct if invalid id or missing fields", async function () {
    await contract.createProduct("Rau", "Đà Lạt", "2025-10-01", "2025-10-30");

    await expect(
      contract.updateProduct(999, "Invalid", "None")
    ).to.be.revertedWith("Invalid product ID");

    await expect(
      contract.updateProduct(1, "", "Transporter")
    ).to.be.revertedWith("Info required");

    await expect(contract.updateProduct(1, "Delivered", "")).to.be.revertedWith(
      "New owner required"
    );
  });

  it("should revert getProduct with invalid id", async function () {
    await expect(contract.getProduct(1)).to.be.revertedWith(
      "Invalid product ID"
    );
  });
});
