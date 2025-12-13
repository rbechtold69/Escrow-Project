// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/test/MockUSDC.sol";
import "../src/test/MockUSDM.sol";
import "../src/test/TestEscrowVault.sol";

/**
 * @title DeployTestnet
 * @notice Deploy mock contracts to Base Sepolia testnet
 * 
 * Usage:
 *   export PRIVATE_KEY=0x...
 *   forge script script/DeployTestnet.s.sol --rpc-url https://sepolia.base.org --broadcast
 */
contract DeployTestnet is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying from:", deployer);
        console.log("Chain ID:", block.chainid);
        
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockUSDC
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed at:", address(usdc));
        
        // 2. Deploy MockUSDM
        MockUSDM usdm = new MockUSDM();
        console.log("MockUSDM deployed at:", address(usdm));
        
        // 3. Deploy a test EscrowVault
        // In production, these would be created per-escrow via factory
        TestEscrowVault vault = new TestEscrowVault(
            address(usdc),
            deployer,      // Safe (using deployer for testing)
            deployer,      // Buyer (using deployer for testing)
            deployer       // Platform wallet
        );
        console.log("TestEscrowVault deployed at:", address(vault));
        
        // 4. Mint some test tokens to deployer
        usdc.mint(deployer, 1_000_000 * 10**6);  // 1M USDC
        usdm.mint(deployer, 1_000_000 * 10**18); // 1M USDM
        
        vm.stopBroadcast();
        
        // Print summary
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("Chain: Base Sepolia (84532)");
        console.log("MockUSDC:", address(usdc));
        console.log("MockUSDM:", address(usdm));
        console.log("TestEscrowVault:", address(vault));
        console.log("\nAdd these to your .env.local:");
        console.log("NEXT_PUBLIC_MOCK_USDC_ADDRESS=", address(usdc));
        console.log("NEXT_PUBLIC_MOCK_USDM_ADDRESS=", address(usdm));
        console.log("NEXT_PUBLIC_TEST_VAULT_ADDRESS=", address(vault));
    }
}
