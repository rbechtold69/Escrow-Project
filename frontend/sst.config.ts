/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "escrow-base",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    // Database connection from Neon.tech
    const databaseUrl = new sst.Secret("DatabaseUrl");
    
    // Bridge.xyz API credentials
    const bridgeApiKey = new sst.Secret("BridgeApiKey");
    const bridgeApiSecret = new sst.Secret("BridgeApiSecret");
    
    // Deploy Next.js as serverless on AWS Lambda
    new sst.aws.Nextjs("EscrowBaseWeb", {
      environment: {
        DATABASE_URL: databaseUrl.value,
        BRIDGE_API_KEY: bridgeApiKey.value,
        BRIDGE_API_SECRET: bridgeApiSecret.value,
        BRIDGE_USE_MOCK: process.env.BRIDGE_USE_MOCK || "false",
      },
    });
  },
});
