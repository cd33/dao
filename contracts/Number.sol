// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Number is Ownable {
    uint256 public number;

    event NumberChanged(uint256 _number);

    function setNumber(uint256 _number) public onlyOwner {
        number = _number;
        emit NumberChanged(_number);
    }
}
