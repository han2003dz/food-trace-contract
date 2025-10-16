// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

contract ProductTracking {
  struct Product {
    uint256 id;
    string name;
    string origin;
    string manufactureDate;
    string expiryDate;
    string currentOwner;
    string[] history;
  }

  mapping(uint256 => Product) private products;

  uint256 public productCount;

  event ProductCreated(uint256 indexed id, string name, string origin);
  event ProductUpdated(uint256 indexed id, string info, string newOwner);

  function createProduct(
    string memory _name,
    string memory _origin,
    string memory _manufactureDate,
    string memory _expiryDate
  ) public {

    require(bytes(_name).length > 0, "Product name required");
    require(bytes(_origin).length > 0, "Origin required");

    productCount++;
    uint256 newId = productCount;

    Product storage p = products[newId];
    p.id = newId;
    p.name = _name;
    p.origin = _origin;
    p.manufactureDate = _manufactureDate;
    p.expiryDate = _expiryDate;
    p.currentOwner = "Producer";
    p.history.push("Created by Producer");

    emit ProductCreated(newId, _name, _origin);
  }

  function updateProduct(
    uint256 _id,
    string memory _info,
    string memory _newOwner
  ) public {
    require(_id > 0 && _id <= productCount, "Invalid product ID");
    require(bytes(_info).length > 0, "Info required");
    require(bytes(_newOwner).length > 0, "New owner required");

    Product storage p = products[_id];
    p.currentOwner = _newOwner;
    p.history.push(_info);
    emit ProductUpdated(_id, _info, _newOwner);
  }

  function getProduct(uint256 id) public view returns (
      uint256,
      string memory,
      string memory,
      string memory,
      string memory,
      string memory,
      string[] memory
    )
  {
    require(id > 0 && id <= productCount, "Invalid product ID");

    Product memory p = products[id];
    return (
      p.id,
      p.name,
      p.origin,
      p.manufactureDate,
      p.expiryDate,
      p.currentOwner,
      p.history
    );
  }
}