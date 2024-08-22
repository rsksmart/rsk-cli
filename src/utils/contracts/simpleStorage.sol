// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleStorage {
    uint256 private storedData;

    // Constructor that sets the initial stored data
    constructor(uint256 initialValue) {
        storedData = initialValue;
    }

    // Function to set the stored data
    function set(uint256 x) public {
        storedData = x;
    }

    // Function to get the stored data
    function get() public view returns (uint256) {
        return storedData;
    }
}
