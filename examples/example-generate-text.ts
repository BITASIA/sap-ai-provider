#!/usr/bin/env node

/**
 * SAP AI Provider - Generate Text Example
 *
 * This example demonstrates basic text generation with different models
 * using the Vercel AI SDK's generateText function.
 *
 * Authentication:
 * - On SAP BTP: Automatically uses service binding (VCAP_SERVICES)
 * - Locally: Set AICORE_SERVICE_KEY environment variable with your service key JSON
 */

// Load environment variables
import "dotenv/config";
import { APICallError } from "@ai-sdk/provider";
import { generateText } from "ai";
// In YOUR production project, use the published package instead:
// import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
// ============================================================================

// ============================================================================
// NOTE: Import Path for Development vs Production
// ============================================================================
// This example uses relative imports for local development within this repo:
import { createSAPAIProvider } from "../src/index";

/**
 *
 */
async function generateTextExample() {
  console.log("📝 SAP AI Text Generation Example\n");

  // Verify AICORE_SERVICE_KEY is set for local development
  if (!process.env.AICORE_SERVICE_KEY && !process.env.VCAP_SERVICES) {
    console.warn("⚠️  Warning: AICORE_SERVICE_KEY environment variable not set.");
    console.warn("   Set it in your .env file or environment for local development.\n");
  }

  try {
    const provider = createSAPAIProvider();

    // Generate text with GPT-4o
    console.log("🤖 Testing gpt-4o...");
    const { finishReason, text, usage } = await generateText({
      messages: [
        {
          content: "How to make a delicious mashed potatoes?",
          role: "user",
        },
      ],
      model: provider("gpt-4o"),
    });

    console.log("📄 Response:", text);
    console.log(
      "📊 Usage:",
      `${String(usage.inputTokens)} input + ${String(usage.outputTokens)} output = ${String(usage.totalTokens)} total tokens`,
    );
    console.log("🏁 Finish reason:", finishReason);

    // Test multiple models (Harmonized API)
    console.log("\n================================");
    console.log("Testing Multiple Models (Harmonized API)");
    console.log("================================\n");

    const models = ["gemini-2.0-flash", "anthropic--claude-3.5-sonnet"];

    for (const modelId of models) {
      console.log(`\n🤖 Testing ${modelId}...`);
      try {
        const {
          finishReason: modelFinish,
          text: modelText,
          usage: modelUsage,
        } = await generateText({
          messages: [
            {
              content: "What is 2 + 2? Reply with just the number.",
              role: "user",
            },
          ],
          model: provider(modelId),
        });
        console.log("📄 Response:", modelText);
        console.log(
          "📊 Usage:",
          `${String(modelUsage.inputTokens)} input + ${String(modelUsage.outputTokens)} output`,
        );
        console.log("🏁 Finish reason:", modelFinish);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(`❌ Error with ${modelId}:`, errorMessage);
      }
    }

    console.log("\n✅ All tests completed!");
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
      console.error("❌ Example failed:", errorMessage);
    }

    console.error("\n💡 Troubleshooting tips:");
    console.error("   - Ensure AICORE_SERVICE_KEY is set with valid credentials");
    console.error("   - Check that your SAP AI Core instance is accessible");
    console.error("   - Verify the model is available in your deployment");
  }
}

generateTextExample().catch(console.error);

export { generateTextExample };
