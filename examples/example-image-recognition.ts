#!/usr/bin/env node

/**
 * SAP AI Provider - Image Recognition Example
 *
 * This example demonstrates multi-modal capabilities (text + images)
 * using the SAP AI Provider with vision-enabled models.
 *
 * Authentication:
 * - On SAP BTP: Automatically uses service binding (VCAP_SERVICES)
 * - Locally: Set AICORE_SERVICE_KEY environment variable with your service key JSON
 */

// Load environment variables
import "dotenv/config";
import { generateText } from "ai";

// ============================================================================
// NOTE: Import Path for Development vs Production
// ============================================================================
// This example uses relative imports for local development within this repo:
import { createSAPAIProvider } from "../src/index";
// In YOUR production project, use the published package instead:
// import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
// ============================================================================

import { APICallError } from "@ai-sdk/provider";

async function imageRecognitionExample() {
  console.log("🖼️  SAP AI Image Recognition Example\n");

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
    const provider = createSAPAIProvider();

    // Example 1: Using a public URL
    console.log("📸 Example 1: Public URL Image");
    console.log("==============================");

    const { text: urlResponse } = await generateText({
      model: provider("gpt-4o"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "What do you see in this image?",
            },
            {
              type: "image",
              image: new URL(
                "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
              ),
            },
          ],
        },
      ],
    });

    console.log("🤖 Response:", urlResponse);
    console.log("");

    // Example 2: Using base64 encoded image
    console.log("📸 Example 2: Base64 Encoded Image");
    console.log("==================================");

    // Small 1x1 pixel red PNG for demo
    const base64Image =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

    const { text: base64Response } = await generateText({
      model: provider("gpt-4o"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this image in detail.",
            },
            {
              type: "image",
              image: `data:image/png;base64,${base64Image}`,
            },
          ],
        },
      ],
    });

    console.log("🤖 Response:", base64Response);
    console.log("");

    // Example 3: Multiple images analysis
    console.log("📸 Example 3: Multiple Images Analysis");
    console.log("=====================================");

    const { text: multiResponse } = await generateText({
      model: provider("gpt-4o"),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Compare these two images and tell me what you notice:",
            },
            {
              type: "image",
              image: new URL(
                "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png",
              ),
            },
            {
              type: "image",
              image: `data:image/png;base64,${base64Image}`,
            },
          ],
        },
      ],
    });

    console.log("🤖 Response:", multiResponse);
    console.log("");

    console.log("✅ All examples completed successfully!");
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

imageRecognitionExample().catch(console.error);

export { imageRecognitionExample };
