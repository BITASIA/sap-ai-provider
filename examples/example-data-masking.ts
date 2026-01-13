#!/usr/bin/env node

/**
 * SAP AI Provider - Data Masking Example (DPI)
 *
 * This example demonstrates data masking/anonymization using
 * SAP Data Privacy Integration (DPI) through the orchestration service.
 *
 * Authentication:
 * - On SAP BTP: Automatically uses service binding (VCAP_SERVICES)
 * - Locally: Set AICORE_SERVICE_KEY environment variable with your service key JSON
 */

// Load environment variables
import "dotenv/config";
import { generateText } from "ai";
import { createSAPAIProvider, buildDpiMaskingProvider } from "../src/index";
import { APICallError } from "@ai-sdk/provider";

async function dataMaskingExample() {
  console.log("🔒 SAP AI Data Masking Example (DPI)\n");

  // Verify AICORE_SERVICE_KEY is set for local development
  if (!process.env.AICORE_SERVICE_KEY && !process.env.VCAP_SERVICES) {
    console.warn(
      "⚠️  Warning: AICORE_SERVICE_KEY environment variable not set.",
    );
    console.warn(
      "   Set it in your .env file or environment for local development.\n",
    );
  }

  try {
    // Build DPI masking configuration using the SDK helper
    const dpiMaskingConfig = buildDpiMaskingProvider({
      method: "anonymization",
      entities: [
        // Standard entities
        "profile-email",
        "profile-person",
        // Custom entity with replacement strategy
        {
          type: "profile-phone",
          replacement_strategy: {
            method: "constant",
            value: "PHONE_REDACTED",
          },
        },
      ],
    });

    // Provider with masking enabled by default
    const provider = createSAPAIProvider({
      defaultSettings: {
        masking: {
          masking_providers: [dpiMaskingConfig],
        },
      },
    });

    const model = provider("gpt-4o");

    console.log("📝 Testing with data masking enabled...\n");

    const { text } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content:
            "Please email Jane Doe (jane.doe@example.com) at +1-555-123-4567 about the meeting.",
        },
      ],
    });

    console.log("🤖 Response:", text);
    console.log(
      "\n📌 Note: Personal data like names, emails, and phone numbers should be",
    );
    console.log("   masked by DPI before reaching the model.");

    // Test without masking for comparison
    console.log("\n================================");
    console.log("🧪 Same prompt WITHOUT data masking (for comparison)");
    console.log("================================\n");

    const providerNoMask = createSAPAIProvider();
    const modelNoMask = providerNoMask("gpt-4o");

    const { text: textNoMask } = await generateText({
      model: modelNoMask,
      messages: [
        {
          role: "user",
          content:
            "Please email Jane Doe (jane.doe@example.com) at +1-555-123-4567 about the meeting.",
        },
      ],
    });

    console.log("🤖 Response (no masking):", textNoMask);

    // Verbatim echo test
    console.log("\n================================");
    console.log("📎 Verbatim echo test (shows what model receives)");
    console.log("================================\n");

    const original =
      "My name is John Smith, email: john.smith@company.com, phone: 555-987-6543";

    const { text: echoMasked } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: `Repeat this exactly: ${original}`,
        },
      ],
    });
    console.log("🔒 Echo with masking:", echoMasked);

    const { text: echoNoMask } = await generateText({
      model: modelNoMask,
      messages: [
        {
          role: "user",
          content: `Repeat this exactly: ${original}`,
        },
      ],
    });
    console.log("🔓 Echo without masking:", echoNoMask);

    console.log("\n✅ Data masking example completed!");
  } catch (error: unknown) {
    if (error instanceof APICallError) {
      console.error("❌ API Call Error:", error.statusCode, error.message);

      // Parse SAP-specific metadata
      const sapError = JSON.parse(error.responseBody ?? "{}") as {
        error?: { request_id?: string; code?: string };
      };
      if (sapError.error?.request_id) {
        console.error("   SAP Request ID:", sapError.error.request_id);
        console.error("   SAP Error Code:", sapError.error.code);
      }
    } else {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("❌ Example failed:", errorMessage);
    }

    console.error("\n💡 Troubleshooting tips:");
    console.error(
      "   - Ensure AICORE_SERVICE_KEY is set with valid credentials",
    );
    console.error("   - Check that your SAP AI Core instance is accessible");
    console.error("   - Verify the model is available in your deployment");
  }
}

dataMaskingExample().catch(console.error);

export { dataMaskingExample };
