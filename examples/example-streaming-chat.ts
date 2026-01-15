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

// Load environment variables
import "dotenv/config";
import { APICallError } from "@ai-sdk/provider";
// In YOUR production project, use the published package instead:
// import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
// ============================================================================
import { streamText } from "ai";

// ============================================================================
// NOTE: Import Path for Development vs Production
// ============================================================================
// This example uses relative imports for local development within this repo:
import { createSAPAIProvider } from "../src/index";

async function streamingChatExample() {
  console.log("🧪 Streaming Chat with Vercel AI SDK (streamText)\n");

  try {
    // Verify AICORE_SERVICE_KEY is set for local development
    if (!process.env.AICORE_SERVICE_KEY && !process.env.VCAP_SERVICES) {
      console.warn("⚠️  Warning: AICORE_SERVICE_KEY environment variable not set.");
      console.warn("   Set it in your .env file or environment for local development.\n");
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
    if (error instanceof APICallError) {
      console.error("❌ API Call Error:", error.statusCode, error.message);

      // Parse SAP-specific metadata
      const sapError = JSON.parse(error.responseBody ?? "{}") as {
        error?: { code?: string; request_id?: string };
      };
      if (sapError.error?.request_id) {
        console.error("   SAP Request ID:", sapError.error.request_id);
        console.error("   SAP Error Code:", sapError.error.code);
      }
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("❌ Streaming example failed:", errorMessage);
    }

    console.error("\n💡 Troubleshooting tips:");
    console.error("   - Ensure AICORE_SERVICE_KEY is set with valid credentials");
    console.error("   - Check that your SAP AI Core instance is accessible");
    console.error("   - Verify the model is available in your deployment");
  }
}

streamingChatExample().catch(console.error);

export { streamingChatExample };
