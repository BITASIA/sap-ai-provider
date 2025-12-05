#!/usr/bin/env npx tsx
/**
 * Quick test script for SAP AI Provider v2
 *
 * Usage: npx tsx test-quick.ts
 *
 * Make sure AICORE_SERVICE_KEY is set in .env or environment
 */

import "dotenv/config";
import { createSAPAIProvider } from "./src/index";
import { generateText } from "ai";

async function quickTest() {
  console.log("🧪 Quick Test: SAP AI Provider v2\n");

  // Check for credentials
  if (!process.env.AICORE_SERVICE_KEY) {
    console.error("❌ AICORE_SERVICE_KEY environment variable is not set!");
    console.error("\nSet it in .env file:");
    console.error(
      'AICORE_SERVICE_KEY=\'{"serviceurls":{"AI_API_URL":"..."},...}\'',
    );
    process.exit(1);
  }

  console.log("✅ AICORE_SERVICE_KEY found");
  console.log("🔄 Creating provider...");

  try {
    const provider = createSAPAIProvider();
    console.log("✅ Provider created (synchronously!)");

    console.log("\n📝 Testing gpt-4o...");
    const { text, usage, finishReason } = await generateText({
      model: provider("gpt-4o"),
      prompt: "Say 'Hello from SAP AI Core!' in exactly those words.",
    });

    console.log("\n✅ SUCCESS!");
    console.log("📄 Response:", text);
    console.log(
      "📊 Tokens:",
      `${usage.inputTokens} in / ${usage.outputTokens} out`,
    );
    console.log("🏁 Finish:", finishReason);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

quickTest();
