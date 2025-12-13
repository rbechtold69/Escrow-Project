// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {EscrowFactory} from "../src/EscrowFactory.sol";

/**
 * @title DeployEscrowFactory
 * @notice Deployment script for EscrowFactory contract on Base L2
 * @dev Run with: forge script script/Deploy.s.sol:DeployEscrowFactory --rpc-url base_sepolia --broadcast --verify
 */
contract DeployEscrowFactory is Script {
    // Base Mainnet addresses
    address constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant BASE_SAFE_PROXY_FACTORY = 0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2;
    address constant BASE_SAFE_SINGLETON = 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552;
    address constant BASE_SAFE_FALLBACK_HANDLER = 0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4;

    // Base Sepolia addresses (testnet)
    address constant SEPOLIA_USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    address constant SEPOLIA_SAFE_PROXY_FACTORY = 0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2;
    address constant SEPOLIA_SAFE_SINGLETON = 0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552;
    address constant SEPOLIA_SAFE_FALLBACK_HANDLER = 0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4;

    function run() external {
        // Load configuration from environment
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address managerSigner = vm.envAddress("MANAGER_SIGNER_ADDRESS");
        bool isTestnet = vm.envOr("IS_TESTNET", true);

        // Select addresses based on network
        address usdc;
        address safeProxyFactory;
        address safeSingleton;
        address safeFallbackHandler;

        if (isTestnet) {
            usdc = SEPOLIA_USDC;
            safeProxyFactory = SEPOLIA_SAFE_PROXY_FACTORY;
            safeSingleton = SEPOLIA_SAFE_SINGLETON;
            safeFallbackHandler = SEPOLIA_SAFE_FALLBACK_HANDLER;
            console.log("Deploying to Base Sepolia (testnet)");
        } else {
            usdc = BASE_USDC;
            safeProxyFactory = BASE_SAFE_PROXY_FACTORY;
            safeSingleton = BASE_SAFE_SINGLETON;
            safeFallbackHandler = BASE_SAFE_FALLBACK_HANDLER;
            console.log("Deploying to Base Mainnet");
        }

        console.log("USDC:", usdc);
        console.log("Safe Proxy Factory:", safeProxyFactory);
        console.log("Manager Signer:", managerSigner);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy EscrowFactory
        EscrowFactory factory = new EscrowFactory(
            usdc,
            safeProxyFactory,
            safeSingleton,
            safeFallbackHandler,
            managerSigner
        );

        console.log("EscrowFactory deployed at:", address(factory));

        // Set initial escrow officers (optional - can be done later)
        // address[] memory officers = new address[](1);
        // officers[0] = vm.envAddress("INITIAL_OFFICER_ADDRESS");
        // for (uint256 i = 0; i < officers.length; i++) {
        //     factory.setEscrowOfficer(officers[i], true);
        // }

        vm.stopBroadcast();

        // Log deployment info for verification
        console.log("\n=== Deployment Summary ===");
        console.log("Network:", isTestnet ? "Base Sepolia" : "Base Mainnet");
        console.log("EscrowFactory:", address(factory));
        console.log("Owner:", factory.owner());
        console.log("");
        console.log("Next steps:");
        console.log("1. Verify contract on Basescan");
        console.log("2. Set escrow officers via setEscrowOfficer()");
        console.log("3. Set compliance signers via setComplianceSigner()");
        console.log("4. Set Bridge webhook signer via setBridgeWebhookSigner()");
        console.log("5. Update .env with factory address");
    }
}

/**
 * @title SetupEscrowFactory
 * @notice Post-deployment configuration script
 */
contract SetupEscrowFactory is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address factoryAddress = vm.envAddress("ESCROW_FACTORY_ADDRESS");
        
        EscrowFactory factory = EscrowFactory(factoryAddress);

        vm.startBroadcast(deployerPrivateKey);

        // Add escrow officers
        address[] memory officers = vm.envOr("ESCROW_OFFICERS", ",", new address[](0));
        for (uint256 i = 0; i < officers.length; i++) {
            factory.setEscrowOfficer(officers[i], true);
            console.log("Added escrow officer:", officers[i]);
        }

        // Add compliance signers
        address[] memory compliance = vm.envOr("COMPLIANCE_SIGNERS", ",", new address[](0));
        for (uint256 i = 0; i < compliance.length; i++) {
            factory.setComplianceSigner(compliance[i], true);
            console.log("Added compliance signer:", compliance[i]);
        }

        // Set Bridge webhook signer
        address bridgeWebhook = vm.envOr("BRIDGE_WEBHOOK_SIGNER", address(0));
        if (bridgeWebhook != address(0)) {
            factory.setBridgeWebhookSigner(bridgeWebhook);
            console.log("Set Bridge webhook signer:", bridgeWebhook);
        }

        vm.stopBroadcast();

        console.log("\n=== Setup Complete ===");
    }
}
