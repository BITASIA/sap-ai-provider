#!/usr/bin/env node

/**
 * SAP AI Provider - Simple Chat Completion Example
 *
 * This example demonstrates basic chat completion using the SAP AI Provider
 * powered by @sap-ai-sdk/orchestration.
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

// ============================================================================
// NOTE: Import Path for Development vs Production
// ============================================================================
// This example uses relative imports for local development within this repo:
import { createSAPAIProvider } from "../src/index";

async function simpleTest() {
  console.log("🧪 Simple SAP AI Chat Completion Example\n");

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

    // Create provider - authentication is handled automatically by SAP AI SDK
    const provider = createSAPAIProvider({
      resourceGroup: "default", // Optional: specify resource group
    });

    console.log("📝 Testing text generation with gpt-4o...");

    const model = provider("gpt-4o", {
      modelParams: {
        maxTokens: 1000,
        temperature: 0.7,
      },
    });

    const result = await model.doGenerate({
      prompt: [
        {
          content: [
            { text: "How to cook a delicious chicken recipe?", type: "text" },
          ],
          role: "user",
        },
      ],
    });

    // Extract text from content array
    const text = result.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("");

    console.log("✅ Success!");
    console.log("📄 Generated text:", text);
    console.log(
      "📊 Usage:",
      `${String(result.usage.inputTokens.total)} prompt + ${String(result.usage.outputTokens.total)} completion tokens`,
    );
    console.log("🏁 Finish reason:", result.finishReason);
    console.log("");
  } catch (error: unknown) {
    if (error instanceof APICallError) {
      console.error("❌ API Call Error:", error.statusCode, error.message);

      // Parse SAP-specific metadata
      const sapError = JSON.parse(error.responseBody ?? "{}") as {
        error?: { code?: string; request_id?: string; };
      };
      if (sapError.error?.request_id) {
        console.error("   SAP Request ID:", sapError.error.request_id);
        console.error("   SAP Error Code:", sapError.error.code);
      }
    } else {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("❌ Test failed:", errorMessage);
    }

    console.error("\n💡 Troubleshooting tips:");
    console.error(
      "   - Ensure AICORE_SERVICE_KEY is set with valid credentials",
    );
    console.error("   - Check that your SAP AI Core instance is accessible");
    console.error("   - Verify the model is available in your deployment");
  }
}

simpleTest().catch(console.error);

export { simpleTest };
