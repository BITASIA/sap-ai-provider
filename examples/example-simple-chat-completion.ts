#!/usr/bin/env node

/**
 * SAP AI Provider Pattern Examples
 *
 * This example demonstrates the simple chat completion using the SAP AI SDK
 * following Vercel AI SDK patterns.
 */

// Load environment variables from .env file
import "dotenv/config";
import { createSAPAIProvider } from "../src/sap-ai-provider";

async function simpleTest() {
  console.log(
    "🧪 Simple SAP AI Test with Environment Variable (User-Friendly)\n",
  );

  try {
    console.log(
      "🔄 Creating provider using SAP_AI_SERVICE_KEY environment variable...",
    );

    // Get service key from environment variable
    const serviceKey = process.env.SAP_AI_SERVICE_KEY;
    if (!serviceKey) {
      throw new Error(
        "SAP_AI_SERVICE_KEY environment variable is required. Please set it in your .env file.",
      );
    }

    // This is all the user needs to do!
    // Make sure to set SAP_AI_SERVICE_KEY in your .env file
    const provider = await createSAPAIProvider({
      serviceKey: serviceKey,
    });

    console.log("📝 Testing text generation...");
    const model = provider("gpt-4o", {
      modelParams: { temperature: 0.7 },
      safePrompt: true,
      structuredOutputs: true,
    });

    const result = await model.doGenerate({
      prompt: [
        {
          role: "user",
          content: [
            { type: "text", text: "How to cook a delicious chicken recipe?" },
          ],
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
      `${result.usage.inputTokens} prompt + ${result.usage.outputTokens} completion tokens`,
    );
    console.log("🏁 Finish reason:", result.finishReason);
    console.log("");
  } catch (error: any) {
    console.error("❌ Test failed:", error.message);

    if (error.message.includes("Failed to get OAuth access token")) {
      console.error("💡 Troubleshooting: OAuth authentication failed");
      console.error("   - Check if your service key is valid");
      console.error("   - Ensure the service key has the correct permissions");
    } else if (error.message.includes("Invalid service key JSON format")) {
      console.error("💡 Troubleshooting: Invalid service key format");
      console.error("   - Make sure the service key is valid JSON");
      console.error("   - Copy the exact service key from SAP BTP");
    } else {
      console.error("💡 General error - check the details above");
    }
  }
}

simpleTest().catch(console.error);

export { simpleTest };
