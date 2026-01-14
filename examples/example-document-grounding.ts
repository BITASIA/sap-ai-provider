#!/usr/bin/env node

/**
 * SAP AI Provider - Document Grounding (RAG) Example
 *
 * This example demonstrates document grounding (Retrieval-Augmented Generation)
 * using the SAP AI Core Orchestration service's document grounding module.
 *
 * Document grounding allows you to ground LLM responses in your own documents
 * stored in a vector database, ensuring answers are based on your specific
 * knowledge base rather than the model's general training data.
 *
 * Prerequisites:
 * - A configured vector database in SAP AI Core (e.g., HANA Cloud Vector Engine)
 * - Documents indexed in the vector database
 * - Vector store ID (data repository ID)
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
import {
  createSAPAIProvider,
  buildDocumentGroundingConfig,
} from "../src/index";
// In YOUR production project, use the published package instead:
// import { createSAPAIProvider, buildDocumentGroundingConfig } from "@mymediset/sap-ai-provider";
// ============================================================================

import { APICallError } from "@ai-sdk/provider";

async function documentGroundingExample() {
  console.log("📚 SAP AI Document Grounding (RAG) Example\n");

  // Verify AICORE_SERVICE_KEY is set for local development
  if (!process.env.AICORE_SERVICE_KEY && !process.env.VCAP_SERVICES) {
    console.warn(
      "⚠️  Warning: AICORE_SERVICE_KEY environment variable not set.",
    );
    console.warn(
      "   Set it in your .env file or environment for local development.\n",
    );
  }

  // Check for vector store configuration
  const VECTOR_STORE_ID = process.env.VECTOR_STORE_ID ?? "vector-store-1";

  console.log("📋 Configuration:");
  console.log(`   Vector Store ID: ${VECTOR_STORE_ID}`);
  console.log("");

  try {
    // Example 1: Basic document grounding configuration
    console.log("================================");
    console.log("📖 Example 1: Basic Document Grounding");
    console.log("================================\n");

    const basicGroundingConfig = buildDocumentGroundingConfig({
      filters: [
        {
          id: VECTOR_STORE_ID,
          // Search across all repositories
          data_repositories: ["*"],
        },
      ],
      // Required: Define placeholders for input question and output
      placeholders: {
        input: ["?question"],
        output: "groundingOutput",
      },
    });

    const provider = createSAPAIProvider({
      defaultSettings: {
        grounding: basicGroundingConfig,
      },
    });

    const model = provider("gpt-4o");

    console.log("📝 Query: What are the key features of SAP AI Core?\n");

    const { text } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: "What are the key features of SAP AI Core?",
        },
      ],
    });

    console.log("🤖 Grounded Response:", text);
    console.log(
      "\n📌 Note: This response is grounded in your vector database documents.",
    );

    // Example 2: Advanced grounding with metadata
    console.log("\n================================");
    console.log("📊 Example 2: Grounding with Metadata");
    console.log("================================\n");

    const advancedGroundingConfig = buildDocumentGroundingConfig({
      filters: [
        {
          id: VECTOR_STORE_ID,
          data_repositories: ["*"],
        },
      ],
      placeholders: {
        input: ["?question"],
        output: "groundingOutput",
      },
      // Request metadata about the retrieved chunks
      metadata_params: ["file_name", "document_id", "chunk_id"],
    });

    const providerAdvanced = createSAPAIProvider({
      defaultSettings: {
        grounding: advancedGroundingConfig,
      },
    });

    const modelAdvanced = providerAdvanced("gpt-4o");

    console.log(
      "📝 Query: How do I deploy a model in SAP AI Core? Include sources.\n",
    );

    const { text: advancedText } = await generateText({
      model: modelAdvanced,
      messages: [
        {
          role: "user",
          content:
            "How do I deploy a model in SAP AI Core? Please cite your sources with file names.",
        },
      ],
    });

    console.log("🤖 Grounded Response with Metadata:", advancedText);

    // Example 3: Comparison with and without grounding
    console.log("\n================================");
    console.log("🔍 Example 3: Grounded vs Ungrounded Comparison");
    console.log("================================\n");

    const providerNoGrounding = createSAPAIProvider();
    const modelNoGrounding = providerNoGrounding("gpt-4o");

    const query = "What is the latest pricing for our enterprise plan?";
    console.log(`📝 Query: ${query}\n`);

    console.log("🌐 Response WITHOUT grounding (general knowledge):");
    const { text: ungroundedText } = await generateText({
      model: modelNoGrounding,
      messages: [
        {
          role: "user",
          content: query,
        },
      ],
    });
    console.log(ungroundedText);

    console.log("\n📚 Response WITH grounding (your documents):");
    const { text: groundedText } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: query,
        },
      ],
    });
    console.log(groundedText);

    console.log("\n✅ Document grounding example completed!");

    console.log("\n💡 Next Steps:");
    console.log("   - Index your documents in SAP HANA Cloud Vector Engine");
    console.log("   - Set VECTOR_STORE_ID environment variable");
    console.log(
      "   - Use document_metadata filters to restrict search to specific documents",
    );
    console.log(
      "   - Use metadata_params to retrieve source information for citations",
    );
    console.log(
      "   - Use metadata_params to retrieve source information for citations",
    );
  } catch (error: unknown) {
    if (error instanceof APICallError) {
      console.error("❌ API Call Error:", error.statusCode, error.message);

      // Parse SAP-specific metadata
      const sapError = JSON.parse(error.responseBody ?? "{}") as {
        error?: { request_id?: string; code?: string; message?: string };
      };
      if (sapError.error?.request_id) {
        console.error("   SAP Request ID:", sapError.error.request_id);
        console.error("   SAP Error Code:", sapError.error.code);
        console.error("   SAP Error Message:", sapError.error.message);
      }

      // Common errors
      if (error.statusCode === 400) {
        console.error(
          "\n💡 Vector store not found or not configured correctly.",
        );
        console.error(
          "   Make sure your vector database is set up in SAP AI Core.",
        );
      } else if (error.statusCode === 404) {
        console.error("\n💡 Document or vector store not found.");
        console.error("   Check your VECTOR_STORE_ID and document names.");
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
    console.error(
      "   - Verify your vector database is configured and populated",
    );
    console.error(
      "   - Ensure VECTOR_STORE_ID matches your actual vector store",
    );
    console.error(
      "   - Check that documents are indexed in the vector database",
    );
  }
}

documentGroundingExample().catch(console.error);

export { documentGroundingExample };
