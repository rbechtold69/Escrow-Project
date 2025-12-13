// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDM
 * @notice Mock USDM token for testnet deployment with simulated yield
 * @dev Simulates Mountain Protocol's rebasing yield mechanism
 * 
 * In production, USDM automatically rebases to reflect 5% APY.
 * For testing, we provide manual functions to simulate yield accrual.
 */
contract MockUSDM is ERC20, Ownable {
    // Simulated 5% APY
    uint256 public constant APY_BPS = 500; // 5% = 500 basis points
    
    // Track deposits for yield calculation
    mapping(address => uint256) public depositTimestamp;
    mapping(address => uint256) public depositAmount;

    constructor() ERC20("Mock USDM", "USDM") Ownable(msg.sender) {
        // Mint 10 million USDM to deployer
        _mint(msg.sender, 10_000_000 * 10**18);
    }

    /**
     * @notice USDM uses 18 decimals
     */
    function decimals() public pure override returns (uint8) {
        return 18;
    }

    /**
     * @notice Mint tokens to any address (for testing)
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
        depositTimestamp[to] = block.timestamp;
        depositAmount[to] = amount;
    }

    /**
     * @notice Faucet function - get 10,000 USDM for testing
     */
    function faucet() external {
        _mint(msg.sender, 10_000 * 10**18);
    }

    /**
     * @notice Simulate yield accrual for an account
     * @dev Call this to "fast forward" and credit yield to an account
     * @param account The account to credit yield to
     * @param daysElapsed Number of days to simulate
     */
    function simulateYield(address account, uint256 daysElapsed) external {
        uint256 principal = depositAmount[account];
        if (principal == 0) return;
        
        // Calculate yield: principal * APY * days / 365
        // APY is in basis points, so divide by 10000
        uint256 yieldAmount = (principal * APY_BPS * daysElapsed) / (365 * 10000);
        
        _mint(account, yieldAmount);
    }

    /**
     * @notice Calculate pending yield for an account
     * @param account The account to check
     * @return Pending yield amount
     */
    function pendingYield(address account) external view returns (uint256) {
        uint256 principal = depositAmount[account];
        if (principal == 0) return 0;
        
        uint256 elapsed = block.timestamp - depositTimestamp[account];
        uint256 daysElapsed = elapsed / 1 days;
        
        return (principal * APY_BPS * daysElapsed) / (365 * 10000);
    }

    /**
     * @notice Get current balance including simulated yield
     * @param account The account to check
     * @return Balance plus pending yield
     */
    function balanceWithYield(address account) external view returns (uint256) {
        return balanceOf(account) + this.pendingYield(account);
    }
}
