#!/usr/bin/env node

// Load environment variables from .env file
import "dotenv/config";
import { createSAPAIProvider } from "../src/sap-ai-provider";
import { streamText } from "ai";

async function streamingChatExample() {
  console.log("🧪 Streaming with Vercel AI SDK (streamText)\n");

  try {
    console.log(
      "🔄 Creating provider using SAP_AI_SERVICE_KEY environment variable...",
    );

    const serviceKey = process.env.SAP_AI_SERVICE_KEY;
    if (!serviceKey) {
      throw new Error(
        "SAP_AI_SERVICE_KEY environment variable is required. Please set it in your .env file.",
      );
    }

    const provider = await createSAPAIProvider({ serviceKey });
    const model = provider("gpt-4o");

    console.log("📡 Starting streaming response...\n");

    const { textStream, response, warnings } = (await streamText({
      model,
      prompt: "Write a story about a cat.",
      // Optionally request specific response format
      // experimental: { response_format: { type: "text" } as any },
    } as any)) as any;

    // Print any warnings provided by the SDK
    if (warnings && Array.isArray(warnings) && warnings.length > 0) {
      console.log(
        "⚠️  Warnings:",
        warnings.map((w: any) => w.type).join(", "),
      );
    }

    let aggregated = "";
    for await (const textPart of textStream) {
      process.stdout.write(textPart);
      aggregated += textPart;
    }

    console.log("\n\n✅ Stream finished");
    console.log("📄 Aggregated text:\n", aggregated.trim());

    // Low-level metadata when available
    console.log("ℹ️  Raw response id:", (await response)?.id ?? "-");
  } catch (error: any) {
    console.error("❌ Streaming example failed:", error.message);

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

streamingChatExample().catch(console.error);

export { streamingChatExample };


