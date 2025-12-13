// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @notice Mock USDC token for testnet deployment
 * @dev Anyone can mint tokens for testing purposes
 */
contract MockUSDC is ERC20, Ownable {
    constructor() ERC20("Mock USDC", "USDC") Ownable(msg.sender) {
        // Mint 10 million USDC to deployer
        _mint(msg.sender, 10_000_000 * 10**6);
    }

    /**
     * @notice USDC uses 6 decimals
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @notice Mint tokens to any address (for testing)
     * @param to Address to receive tokens
     * @param amount Amount in smallest units (6 decimals)
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /**
     * @notice Faucet function - get 10,000 USDC for testing
     */
    function faucet() external {
        _mint(msg.sender, 10_000 * 10**6);
    }
}
