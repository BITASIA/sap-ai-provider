#!/usr/bin/env node

import { generateText } from "ai";
import { createSAPAIProvider, type DpiConfig } from "../src/index";
import "dotenv/config";

(async () => {
  console.log("🔒 SAP AI Core Data Masking Example (DPI)\n");

  const serviceKey = process.env.SAP_AI_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SAP_AI_SERVICE_KEY environment variable is required. Please set it in your .env file.",
    );
  }

  const dpiMasking: DpiConfig = {
    type: "sap_data_privacy_integration",
    method: "anonymization",
    entities: [
      {
        type: "profile-email",
        replacement_strategy: { method: "fabricated_data" },
      },
      {
        type: "profile-person",
        replacement_strategy: { method: "constant", value: "NAME_REDACTED" },
      },
      {
        // Custom ID format, e.g., 1234-5678-901
        regex: "\\b[0-9]{4}-[0-9]{4}-[0-9]{3,5}\\b",
        replacement_strategy: { method: "constant", value: "REDACTED_ID" },
      },
    ],
    allowlist: ["SAP"],
    mask_grounding_input: { enabled: false },
  };

  // Provider default so all models use masking unless overridden per-call
  const provider = await createSAPAIProvider({
    serviceKey,
    defaultSettings: {
      masking: { masking_providers: [dpiMasking] },
    },
  });

  const model = provider("gpt-4o");

  const { text } = await generateText({
    model,
    messages: [
      {
        role: "user",
        content:
          "Please email Jane Doe (jane.doe@example.com) about order 1234-5678-901 and mention SAP.",
      },
    ],
  });

  console.log("🤖 Response:", text);
  console.log(
    "\nNote: Personal data like names/emails/IDs should be masked by DPI before reaching the model, while 'SAP' is preserved due to the allowlist.",
  );

  // Same prompt WITHOUT masking for comparison
  console.log(
    "\n---\n\n🧪 Running the same prompt WITHOUT data masking for comparison\n",
  );
  const providerNoMask = await createSAPAIProvider({ serviceKey });
  const modelNoMask = providerNoMask("gpt-4o");
  const { text: textNoMask } = await generateText({
    model: modelNoMask,
    messages: [
      {
        role: "user",
        content:
          "Please email Jane Doe (jane.doe@example.com) about order 1234-5678-901 and mention SAP.",
      },
    ],
  });
  console.log("🤖 Response (no masking):", textNoMask);

  // Verbatim echo test to demonstrate masked input as seen by the LLM
  console.log(
    "\n---\n\n📎 Verbatim echo test (shows what the model actually receives)\n",
  );
  const original =
    "Please email Jane Doe (jane.doe@example.com) about order 1234-5678-901 and mention SAP.";
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
})();
