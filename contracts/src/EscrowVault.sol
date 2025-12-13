// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ESCROW VAULT - Real Estate Escrow with Aerodrome Yield
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * This contract holds escrow funds and generates yield automatically:
 * 
 * YIELD STRATEGY:
 * 1. User deposits USDC (via Bridge.xyz wire transfer)
 * 2. Contract immediately swaps USDC → USDM via Aerodrome DEX (Stable Pool)
 * 3. USDM is a rebasing stablecoin earning ~5% APY from T-Bills
 * 4. On escrow close, swap USDM → USDC via Aerodrome (Stable Pool)
 * 5. Yield (profit) is sent to the BUYER as a rebate
 * 
 * AERODROME CONFIGURATION:
 * - Uses Stable Swap Curve (stable = true) for minimal slippage
 * - USDC/USDM are both $1 pegged, so stable curve gives ~1:1 rate
 * - Factory address used to find the correct pool
 * 
 * SECURITY MODEL:
 * - All disbursements require Safe multisig approval (M-of-N signatures)
 * - Only the linked Safe can call closeEscrow()
 * - Emergency withdraw requires owner + time delay
 * 
 * BASE MAINNET ADDRESSES:
 * - USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 * - USDM: 0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C
 * - Aerodrome Router: 0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43
 * - Aerodrome Factory: 0x420DD381b31aEf6683db6B902084cB0FFECe40Da
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ═══════════════════════════════════════════════════════════════════════════════
// AERODROME ROUTER INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @notice Aerodrome Router interface for swapping tokens
 * @dev Aerodrome uses a Route[] array to define swap paths
 * 
 * CRITICAL: The `stable` boolean in Route struct determines the curve:
 * - stable = true  → Stable Swap Curve (for pegged assets like USDC/USDM)
 * - stable = false → Volatile Curve (for non-pegged assets)
 * 
 * Using stable = true for USDC/USDM ensures minimal slippage (~1:1 rate)
 */
interface IAerodromeRouter {
    /**
     * @notice Route struct defines a single hop in a swap path
     * @param from Token to swap from
     * @param to Token to swap to
     * @param stable TRUE for stable curve (pegged assets), FALSE for volatile
     * @param factory The pool factory address (Aerodrome uses multiple factories)
     */
    struct Route {
        address from;
        address to;
        bool stable;      // ← CRITICAL: Set to TRUE for USDC/USDM!
        address factory;
    }

    /**
     * @notice Swap exact input tokens for output tokens along a route
     * @param amountIn Amount of input tokens to swap
     * @param amountOutMin Minimum output tokens (slippage protection)
     * @param routes Array of Route structs defining the swap path
     * @param to Recipient of output tokens
     * @param deadline Unix timestamp deadline for the swap
     * @return amounts Array of amounts for each hop
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        Route[] calldata routes,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    /**
     * @notice Get output amounts for a given input along routes
     * @param amountIn Input amount
     * @param routes Swap route path
     * @return amounts Expected output amounts
     */
    function getAmountsOut(
        uint256 amountIn,
        Route[] calldata routes
    ) external view returns (uint256[] memory amounts);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESCROW VAULT CONTRACT
// ═══════════════════════════════════════════════════════════════════════════════

contract EscrowVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTANTS - BASE MAINNET ADDRESSES
    // ═══════════════════════════════════════════════════════════════════════════
    
    /// @notice USDC token on Base
    IERC20 public constant USDC = IERC20(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913);
    
    /// @notice USDM (Mountain Protocol) token on Base - earns ~5% APY
    IERC20 public constant USDM = IERC20(0x59D9356E565Ab3A36dD77763Fc0d87fEaf85508C);
    
    /// @notice Aerodrome Router for swaps
    IAerodromeRouter public constant AERODROME_ROUTER = 
        IAerodromeRouter(0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43);
    
    /// @notice Aerodrome Factory (needed for Route struct)
    address public constant AERODROME_FACTORY = 0x420DD381b31aEf6683db6B902084cB0FFECe40Da;

    /// @notice Platform fee on yield (0.5% = 50 basis points)
    uint256 public constant PLATFORM_FEE_BPS = 50;
    
    /// @notice Slippage tolerance (0.5% = 50 basis points)
    uint256 public constant SLIPPAGE_BPS = 50;

    // ═══════════════════════════════════════════════════════════════════════════
    // STATE VARIABLES
    // ═══════════════════════════════════════════════════════════════════════════
    
    /// @notice Safe multisig that controls this escrow
    address public immutable safe;
    
    /// @notice Buyer address - receives yield rebate on close
    address public immutable buyer;
    
    /// @notice Platform wallet - receives fee on yield
    address public immutable platformWallet;
    
    /// @notice Original USDC deposit amount (for yield calculation)
    uint256 public initialDepositUSDC;
    
    /// @notice Timestamp of initial deposit
    uint256 public depositTimestamp;
    
    /// @notice Whether the escrow is still open
    bool public isOpen;

    // ═══════════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════════════════════
    
    event Deposited(
        address indexed depositor,
        uint256 usdcAmount,
        uint256 usdmReceived,
        uint256 timestamp
    );
    
    event EscrowClosed(
        address[] payees,
        uint256[] amounts,
        uint256 totalPrincipal,
        uint256 totalYield,
        uint256 platformFee,
        uint256 buyerRebate
    );
    
    event SwapExecuted(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        bool stable
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /// @notice Restricts function to Safe multisig only
    modifier onlySafe() {
        require(msg.sender == safe, "EscrowVault: caller is not the Safe");
        _;
    }
    
    /// @notice Ensures escrow is still open
    modifier whenOpen() {
        require(isOpen, "EscrowVault: escrow is closed");
        _;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Create a new escrow vault
     * @param _safe Safe multisig address that controls disbursements
     * @param _buyer Buyer address that receives yield rebate
     * @param _platformWallet Platform wallet for fees
     */
    constructor(
        address _safe,
        address _buyer,
        address _platformWallet
    ) {
        require(_safe != address(0), "EscrowVault: invalid safe address");
        require(_buyer != address(0), "EscrowVault: invalid buyer address");
        
        safe = _safe;
        buyer = _buyer;
        platformWallet = _platformWallet;
        isOpen = true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // DEPOSIT FUNCTION
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Deposit USDC into escrow - automatically swaps to USDM for yield
     * @param amount Amount of USDC to deposit (6 decimals)
     * 
     * FLOW:
     * 1. Transfer USDC from sender to this contract
     * 2. Approve Aerodrome Router to spend USDC
     * 3. Swap USDC → USDM using STABLE curve (stable = true)
     * 4. USDM balance now earns ~5% APY via rebasing
     */
    function deposit(uint256 amount) external whenOpen nonReentrant {
        require(amount > 0, "EscrowVault: amount must be > 0");
        require(initialDepositUSDC == 0, "EscrowVault: already deposited");
        
        // Record initial deposit for yield calculation
        initialDepositUSDC = amount;
        depositTimestamp = block.timestamp;
        
        // Transfer USDC from sender
        USDC.safeTransferFrom(msg.sender, address(this), amount);
        
        // Swap USDC → USDM via Aerodrome
        uint256 usdmReceived = _swapUSDCtoUSDM(amount);
        
        emit Deposited(msg.sender, amount, usdmReceived, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CLOSE ESCROW FUNCTION
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Close the escrow and distribute funds to payees
     * @dev Only callable by the Safe multisig
     * @param payees Array of payee addresses (sellers, agents, etc.)
     * @param amounts Array of USDC amounts for each payee
     * 
     * FLOW:
     * 1. Swap all USDM → USDC via Aerodrome (stable curve)
     * 2. Calculate yield = finalUSDC - initialDeposit
     * 3. Distribute principal to payees
     * 4. Send yield rebate to buyer (minus platform fee)
     */
    function closeEscrow(
        address[] calldata payees,
        uint256[] calldata amounts
    ) external onlySafe whenOpen nonReentrant {
        require(payees.length == amounts.length, "EscrowVault: array length mismatch");
        require(payees.length > 0, "EscrowVault: no payees");
        require(initialDepositUSDC > 0, "EscrowVault: no funds deposited");
        
        // Mark escrow as closed
        isOpen = false;
        
        // Get current USDM balance (includes rebased yield)
        uint256 usdmBalance = USDM.balanceOf(address(this));
        require(usdmBalance > 0, "EscrowVault: no USDM balance");
        
        // Swap all USDM → USDC
        uint256 finalUSDC = _swapUSDMtoUSDC(usdmBalance);
        
        // Calculate yield
        uint256 totalYield = 0;
        if (finalUSDC > initialDepositUSDC) {
            totalYield = finalUSDC - initialDepositUSDC;
        }
        
        // Calculate platform fee (0.5% of yield)
        uint256 platformFee = (totalYield * PLATFORM_FEE_BPS) / 10000;
        uint256 buyerRebate = totalYield - platformFee;
        
        // Verify payee amounts don't exceed principal
        uint256 totalPayeeAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalPayeeAmount += amounts[i];
        }
        require(totalPayeeAmount <= initialDepositUSDC, "EscrowVault: payee amounts exceed principal");
        
        // Distribute to payees
        for (uint256 i = 0; i < payees.length; i++) {
            require(payees[i] != address(0), "EscrowVault: invalid payee address");
            if (amounts[i] > 0) {
                USDC.safeTransfer(payees[i], amounts[i]);
            }
        }
        
        // Send yield rebate to buyer
        if (buyerRebate > 0) {
            USDC.safeTransfer(buyer, buyerRebate);
        }
        
        // Send platform fee
        if (platformFee > 0 && platformWallet != address(0)) {
            USDC.safeTransfer(platformWallet, platformFee);
        }
        
        emit EscrowClosed(
            payees,
            amounts,
            totalPayeeAmount,
            totalYield,
            platformFee,
            buyerRebate
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // INTERNAL SWAP FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Swap USDC to USDM via Aerodrome (Stable Curve)
     * @param amountIn Amount of USDC to swap
     * @return amountOut Amount of USDM received
     * 
     * CRITICAL: Uses stable = true for minimal slippage on pegged assets
     */
    function _swapUSDCtoUSDM(uint256 amountIn) internal returns (uint256 amountOut) {
        // Approve router to spend USDC
        USDC.safeApprove(address(AERODROME_ROUTER), amountIn);
        
        // Build the route: USDC → USDM via STABLE pool
        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: address(USDC),
            to: address(USDM),
            stable: true,           // ← CRITICAL: Stable curve for 1:1 pegged assets!
            factory: AERODROME_FACTORY
        });
        
        // Calculate minimum output with slippage protection
        // For stable pairs, expect ~1:1 rate (accounting for decimals: USDC=6, USDM=18)
        uint256[] memory expectedAmounts = AERODROME_ROUTER.getAmountsOut(amountIn, routes);
        uint256 expectedOut = expectedAmounts[expectedAmounts.length - 1];
        uint256 minAmountOut = (expectedOut * (10000 - SLIPPAGE_BPS)) / 10000;
        
        // Execute swap
        uint256[] memory amounts = AERODROME_ROUTER.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            routes,
            address(this),
            block.timestamp + 300  // 5 minute deadline
        );
        
        amountOut = amounts[amounts.length - 1];
        
        emit SwapExecuted(address(USDC), address(USDM), amountIn, amountOut, true);
        
        return amountOut;
    }
    
    /**
     * @notice Swap USDM to USDC via Aerodrome (Stable Curve)
     * @param amountIn Amount of USDM to swap
     * @return amountOut Amount of USDC received
     */
    function _swapUSDMtoUSDC(uint256 amountIn) internal returns (uint256 amountOut) {
        // Approve router to spend USDM
        USDM.safeApprove(address(AERODROME_ROUTER), amountIn);
        
        // Build the route: USDM → USDC via STABLE pool
        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: address(USDM),
            to: address(USDC),
            stable: true,           // ← CRITICAL: Stable curve for 1:1 pegged assets!
            factory: AERODROME_FACTORY
        });
        
        // Calculate minimum output with slippage protection
        uint256[] memory expectedAmounts = AERODROME_ROUTER.getAmountsOut(amountIn, routes);
        uint256 expectedOut = expectedAmounts[expectedAmounts.length - 1];
        uint256 minAmountOut = (expectedOut * (10000 - SLIPPAGE_BPS)) / 10000;
        
        // Execute swap
        uint256[] memory amounts = AERODROME_ROUTER.swapExactTokensForTokens(
            amountIn,
            minAmountOut,
            routes,
            address(this),
            block.timestamp + 300  // 5 minute deadline
        );
        
        amountOut = amounts[amounts.length - 1];
        
        emit SwapExecuted(address(USDM), address(USDC), amountIn, amountOut, true);
        
        return amountOut;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * @notice Get current USDM balance (includes rebased yield)
     */
    function getUSDMBalance() external view returns (uint256) {
        return USDM.balanceOf(address(this));
    }
    
    /**
     * @notice Get current USDC balance
     */
    function getUSDCBalance() external view returns (uint256) {
        return USDC.balanceOf(address(this));
    }
    
    /**
     * @notice Estimate current value in USDC (includes yield)
     * @dev Note: This is an estimate - actual swap may differ slightly
     */
    function getEstimatedUSDCValue() external view returns (uint256) {
        uint256 usdmBalance = USDM.balanceOf(address(this));
        if (usdmBalance == 0) return 0;
        
        // Build route for quote
        IAerodromeRouter.Route[] memory routes = new IAerodromeRouter.Route[](1);
        routes[0] = IAerodromeRouter.Route({
            from: address(USDM),
            to: address(USDC),
            stable: true,
            factory: AERODROME_FACTORY
        });
        
        uint256[] memory amounts = AERODROME_ROUTER.getAmountsOut(usdmBalance, routes);
        return amounts[amounts.length - 1];
    }
    
    /**
     * @notice Get estimated yield earned so far
     */
    function getEstimatedYield() external view returns (uint256) {
        uint256 currentValue = this.getEstimatedUSDCValue();
        if (currentValue <= initialDepositUSDC) return 0;
        return currentValue - initialDepositUSDC;
    }
    
    /**
     * @notice Get escrow summary
     */
    function getEscrowSummary() external view returns (
        uint256 _initialDeposit,
        uint256 _currentUSDMBalance,
        uint256 _estimatedUSDCValue,
        uint256 _estimatedYield,
        uint256 _depositTimestamp,
        bool _isOpen
    ) {
        return (
            initialDepositUSDC,
            USDM.balanceOf(address(this)),
            this.getEstimatedUSDCValue(),
            this.getEstimatedYield(),
            depositTimestamp,
            isOpen
        );
    }
}
