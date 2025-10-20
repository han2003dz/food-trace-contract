// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RoleManager {
    address public owner;

    mapping(address => bool) public superAdmins;

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    event SuperAdminSet(address indexed account, bool enabled);

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier onlySuperAdmin() {
        require(
            superAdmins[msg.sender] || msg.sender == owner,
            "NOT_SUPER_ADMIN"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
        superAdmins[msg.sender] = true;
        emit SuperAdminSet(msg.sender, true);
    }

    function tranferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "INVALID_ADDRESS");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setSuperAdmin(address account, bool enabled) external onlyOwner {
        superAdmins[account] = enabled;
        emit SuperAdminSet(account, enabled);
    }
}
