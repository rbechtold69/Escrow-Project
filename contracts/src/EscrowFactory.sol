// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./EscrowVault.sol";

/**
 * @title EscrowFactory
 * @notice Factory contract for deploying EscrowVault instances with Safe multisig
 * @dev Each escrow gets its own vault tied to a Safe for security
 */

// Safe Proxy Factory Interface
interface ISafeProxyFactory {
    function createProxyWithNonce(
        address singleton,
        bytes memory initializer,
        uint256 saltNonce
    ) external returns (address proxy);
}

// Safe Interface for initialization
interface ISafe {
    function setup(
        address[] calldata _owners,
        uint256 _threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver
    ) external;
}

contract EscrowFactory is Ownable, ReentrancyGuard {
    // ============ Base Mainnet Safe Addresses ============
    address public constant SAFE_SINGLETON = 0x69f4D1788e39c87893C980c06EdF4b7f686e2938;
    address public constant SAFE_PROXY_FACTORY = 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67;
    address public constant SAFE_FALLBACK_HANDLER = 0x017062a1dE2FE6b99BE3d9d37841FeD19F573804;
    
    // ============ State Variables ============
    address public platformFeeRecipient;
    uint256 public platformFeeBps;
    uint256 public escrowCount;
    
    // Mapping of escrow ID to vault address
    mapping(string => address) public escrowVaults;
    mapping(string => address) public escrowSafes;
    
    // All escrows
    string[] public allEscrowIds;
    
    // ============ Events ============
    event EscrowCreated(
        string indexed escrowId,
        address indexed vault,
        address indexed safe,
        string propertyAddress,
        address buyer,
        address[] owners,
        uint256 threshold
    );
    
    // ============ Constructor ============
    constructor(
        address _platformFeeRecipient,
        uint256 _platformFeeBps
    ) Ownable(msg.sender) {
        require(_platformFeeBps <= 500, "EscrowFactory: fee too high");
        platformFeeRecipient = _platformFeeRecipient;
        platformFeeBps = _platformFeeBps;
    }
    
    // ============ Core Functions ============
    
    /**
     * @notice Create a new escrow with Safe multisig and Vault
     * @param escrowId Unique escrow identifier
     * @param propertyAddress Property address string
     * @param buyer Buyer address for yield rebate
     * @param owners Array of Safe owner addresses
     * @param threshold Number of signatures required (M of N)
     */
    function createEscrow(
        string calldata escrowId,
        string calldata propertyAddress,
        address buyer,
        address[] calldata owners,
        uint256 threshold
    ) external nonReentrant returns (address vault, address safe) {
        require(bytes(escrowId).length > 0, "EscrowFactory: empty escrow ID");
        require(escrowVaults[escrowId] == address(0), "EscrowFactory: escrow exists");
        require(owners.length >= threshold, "EscrowFactory: invalid threshold");
        require(threshold > 0, "EscrowFactory: threshold must be > 0");
        require(buyer != address(0), "EscrowFactory: invalid buyer");
        
        // Create Safe multisig
        safe = _deploySafe(owners, threshold, escrowId);
        
        // Create Vault
        vault = address(new EscrowVault(
            safe,
            platformFeeRecipient,
            platformFeeBps,
            propertyAddress,
            escrowId,
            buyer
        ));
        
        // Store mappings
        escrowVaults[escrowId] = vault;
        escrowSafes[escrowId] = safe;
        allEscrowIds.push(escrowId);
        escrowCount++;
        
        emit EscrowCreated(
            escrowId,
            vault,
            safe,
            propertyAddress,
            buyer,
            owners,
            threshold
        );
        
        return (vault, safe);
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Deploy a Safe multisig proxy
     */
    function _deploySafe(
        address[] calldata owners,
        uint256 threshold,
        string calldata escrowId
    ) internal returns (address) {
        // Encode Safe setup call
        bytes memory initializer = abi.encodeWithSelector(
            ISafe.setup.selector,
            owners,
            threshold,
            address(0),  // to
            "",          // data
            SAFE_FALLBACK_HANDLER,
            address(0),  // paymentToken
            0,           // payment
            address(0)   // paymentReceiver
        );
        
        // Create unique salt from escrow ID
        uint256 saltNonce = uint256(keccak256(abi.encodePacked(escrowId, block.timestamp)));
        
        // Deploy Safe proxy
        address safe = ISafeProxyFactory(SAFE_PROXY_FACTORY).createProxyWithNonce(
            SAFE_SINGLETON,
            initializer,
            saltNonce
        );
        
        return safe;
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get vault address for escrow ID
     */
    function getVault(string calldata escrowId) external view returns (address) {
        return escrowVaults[escrowId];
    }
    
    /**
     * @notice Get Safe address for escrow ID
     */
    function getSafe(string calldata escrowId) external view returns (address) {
        return escrowSafes[escrowId];
    }
    
    /**
     * @notice Get all escrow IDs
     */
    function getAllEscrowIds() external view returns (string[] memory) {
        return allEscrowIds;
    }
    
    /**
     * @notice Check if escrow exists
     */
    function escrowExists(string calldata escrowId) external view returns (bool) {
        return escrowVaults[escrowId] != address(0);
    }
    
    // ============ Admin Functions ============
    
    /**
     * @notice Update platform fee recipient
     */
    function setPlatformFeeRecipient(address _recipient) external onlyOwner {
        require(_recipient != address(0), "EscrowFactory: invalid recipient");
        platformFeeRecipient = _recipient;
    }
    
    /**
     * @notice Update platform fee
     */
    function setPlatformFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 500, "EscrowFactory: fee too high");
        platformFeeBps = _feeBps;
    }
}
