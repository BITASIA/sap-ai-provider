#!/usr/bin/env node

/**
 * SAP AI Provider - Streaming Chat Example
 *
 * This example demonstrates streaming chat completion using the SAP AI Provider
 * with the Vercel AI SDK's streamText function.
 *
 * Authentication:
 * - On SAP BTP: Automatically uses service binding (VCAP_SERVICES)
 * - Locally: Set AICORE_SERVICE_KEY environment variable with your service key JSON
 */

// Load environment variables from .env file
import "dotenv/config";
import { createSAPAIProvider } from "../src/sap-ai-provider";
import { streamText } from "ai";

async function streamingChatExample() {
  console.log("🧪 Streaming Chat with Vercel AI SDK (streamText)\n");

  try {
    // Verify AICORE_SERVICE_KEY is set for local development
    if (!process.env.AICORE_SERVICE_KEY && !process.env.VCAP_SERVICES) {
      console.warn(
        "⚠️  Warning: AICORE_SERVICE_KEY environment variable not set.",
      );
      console.warn(
        "   Set it in your .env file or environment for local development.\n",
      );
    }

    console.log("🔄 Creating SAP AI provider...");

    const provider = createSAPAIProvider();
    const model = provider("gpt-4o");

    console.log("📡 Starting streaming response...\n");

    const { textStream, usage } = streamText({
      model,
      prompt: "Write a short story about a cat who learns to code.",
    });

    let aggregated = "";
    for await (const textPart of textStream) {
      process.stdout.write(textPart);
      aggregated += textPart;
    }

    console.log("\n\n✅ Stream finished");
    console.log("📄 Total characters:", aggregated.length);

    // Get usage after stream completes
    const finalUsage = await usage;
    console.log(
      "📊 Usage:",
      `${String(finalUsage.inputTokens)} prompt + ${String(finalUsage.outputTokens)} completion tokens`,
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Streaming example failed:", errorMessage);

    console.error("\n💡 Troubleshooting tips:");
    console.error(
      "   - Ensure AICORE_SERVICE_KEY is set with valid credentials",
    );
    console.error("   - Check that your SAP AI Core instance is accessible");
    console.error("   - Verify the model is available in your deployment");
  }
}

streamingChatExample().catch(console.error);

export { streamingChatExample };
