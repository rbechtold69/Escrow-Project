// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TestEscrowVault
 * @notice Simplified escrow vault for TESTNET deployment
 * @dev This version does NOT swap tokens - it simulates yield for testing
 * 
 * DIFFERENCES FROM PRODUCTION:
 * - No Aerodrome DEX integration (doesn't exist on testnet)
 * - Uses MockUSDC and MockUSDM tokens
 * - Yield is simulated rather than earned through rebasing
 * - Simplified for easier testing
 * 
 * TESTING FLOW:
 * 1. Deposit MockUSDC → stored in contract
 * 2. Call simulateYield() to add fake yield
 * 3. closeEscrow() distributes principal + yield
 */
contract TestEscrowVault is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════════════════
    
    IERC20 public immutable usdc;
    
    address public safe;              // Multisig that controls this vault
    address public buyer;             // Receives yield rebate
    address public platformWallet;    // Receives platform fee
    
    uint256 public initialDepositUSDC;
    uint256 public currentBalance;
    uint256 public simulatedYield;
    uint256 public depositTimestamp;
    
    uint256 public constant PLATFORM_FEE_BPS = 50; // 0.5% of yield
    uint256 public constant APY_BPS = 500;         // 5% simulated APY
    
    bool public isOpen;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════
    
    event Deposited(address indexed from, uint256 amount, uint256 timestamp);
    event YieldSimulated(uint256 yieldAmount, uint256 totalBalance);
    event EscrowClosed(
        uint256 principal,
        uint256 yield,
        uint256 platformFee,
        uint256 buyerRebate
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════
    
    constructor(
        address _usdc,
        address _safe,
        address _buyer,
        address _platformWallet
    ) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_safe != address(0), "Invalid Safe address");
        require(_buyer != address(0), "Invalid buyer address");
        
        usdc = IERC20(_usdc);
        safe = _safe;
        buyer = _buyer;
        platformWallet = _platformWallet;
        isOpen = true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════
    
    modifier onlySafe() {
        require(msg.sender == safe, "Only Safe can call");
        _;
    }
    
    modifier whenOpen() {
        require(isOpen, "Escrow is closed");
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DEPOSIT FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Deposit USDC into the escrow
     * @param amount Amount of USDC to deposit (6 decimals)
     */
    function deposit(uint256 amount) external whenOpen nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(initialDepositUSDC == 0, "Already deposited");
        
        // Transfer USDC from sender
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        
        initialDepositUSDC = amount;
        currentBalance = amount;
        depositTimestamp = block.timestamp;
        
        emit Deposited(msg.sender, amount, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // YIELD SIMULATION (TESTNET ONLY)
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Simulate yield accrual (for testing)
     * @dev In production, yield comes from USDM rebasing
     * @param daysToSimulate Number of days of yield to add
     */
    function simulateYield(uint256 daysToSimulate) external onlyOwner whenOpen {
        require(initialDepositUSDC > 0, "No deposit");
        
        // Calculate yield: principal * APY * days / 365
        uint256 yieldAmount = (initialDepositUSDC * APY_BPS * daysToSimulate) / (365 * 10000);
        
        simulatedYield += yieldAmount;
        currentBalance = initialDepositUSDC + simulatedYield;
        
        emit YieldSimulated(yieldAmount, currentBalance);
    }
    
    /**
     * @notice Auto-calculate yield based on time elapsed
     */
    function calculateAccruedYield() public view returns (uint256) {
        if (initialDepositUSDC == 0) return 0;
        
        uint256 elapsed = block.timestamp - depositTimestamp;
        uint256 daysElapsed = elapsed / 1 days;
        
        return (initialDepositUSDC * APY_BPS * daysElapsed) / (365 * 10000);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CLOSE ESCROW
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Close the escrow and distribute funds
     * @dev Only callable by the Safe multisig
     * @param payees Array of payee addresses
     * @param amounts Array of amounts for each payee
     */
    function closeEscrow(
        address[] calldata payees,
        uint256[] calldata amounts
    ) external onlySafe whenOpen nonReentrant {
        require(payees.length == amounts.length, "Array length mismatch");
        require(initialDepositUSDC > 0, "No funds deposited");
        
        isOpen = false;
        
        // Calculate final yield (use simulated or time-based)
        uint256 totalYield = simulatedYield > 0 ? simulatedYield : calculateAccruedYield();
        uint256 totalBalance = initialDepositUSDC + totalYield;
        
        // Calculate platform fee (0.5% of yield)
        uint256 platformFee = (totalYield * PLATFORM_FEE_BPS) / 10000;
        uint256 buyerRebate = totalYield - platformFee;
        
        // Verify we have enough balance
        uint256 payeeTotal = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            payeeTotal += amounts[i];
        }
        require(payeeTotal <= initialDepositUSDC, "Payee amounts exceed principal");
        
        // For testing, mint additional USDC to cover yield
        // In production, this comes from USDM → USDC swap
        // Here we just use what we have
        
        // Distribute to payees
        for (uint256 i = 0; i < payees.length; i++) {
            if (amounts[i] > 0) {
                usdc.safeTransfer(payees[i], amounts[i]);
            }
        }
        
        // Send buyer rebate (from remaining balance or simulated)
        if (buyerRebate > 0 && usdc.balanceOf(address(this)) >= buyerRebate) {
            usdc.safeTransfer(buyer, buyerRebate);
        }
        
        // Send platform fee
        if (platformFee > 0 && platformWallet != address(0)) {
            uint256 remaining = usdc.balanceOf(address(this));
            if (remaining >= platformFee) {
                usdc.safeTransfer(platformWallet, platformFee);
            }
        }
        
        emit EscrowClosed(initialDepositUSDC, totalYield, platformFee, buyerRebate);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    function getEscrowSummary() external view returns (
        uint256 _initialDeposit,
        uint256 _currentBalance,
        uint256 _accruedYield,
        uint256 _timeElapsed,
        bool _isOpen
    ) {
        return (
            initialDepositUSDC,
            currentBalance,
            simulatedYield > 0 ? simulatedYield : calculateAccruedYield(),
            block.timestamp - depositTimestamp,
            isOpen
        );
    }
    
    function getEstimatedYield() external view returns (uint256) {
        return simulatedYield > 0 ? simulatedYield : calculateAccruedYield();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // EMERGENCY FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Emergency withdraw (owner only, for testing)
     */
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = usdc.balanceOf(address(this));
        if (balance > 0) {
            usdc.safeTransfer(owner(), balance);
        }
        isOpen = false;
    }
}
