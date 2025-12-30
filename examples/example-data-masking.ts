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

import { generateText } from "ai";
import { createSAPAIProvider, buildDpiMaskingProvider } from "../src/index";
import "dotenv/config";

await (async () => {
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
        replacement_strategy: { method: "constant", value: "PHONE_REDACTED" },
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
})();
