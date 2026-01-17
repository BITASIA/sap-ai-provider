#!/usr/bin/env node

/**
 * SAP AI Provider - Embeddings Example
 *
 * This example demonstrates text embedding generation using the SAP AI Provider
 * with the Vercel AI SDK's embed and embedMany functions.
 *
 * Use cases:
 * - RAG (Retrieval-Augmented Generation)
 * - Semantic search
 * - Document similarity
 * - Clustering
 *
 * Authentication:
 * - On SAP BTP: Automatically uses service binding (VCAP_SERVICES)
 * - Locally: Set AICORE_SERVICE_KEY environment variable with your service key JSON
 */

// Load environment variables
import "dotenv/config";
import { APICallError, LoadAPIKeyError } from "@ai-sdk/provider";
import { embed, embedMany } from "ai";
// In YOUR production project, use the published package instead:
// import { createSAPAIProvider } from "@mymediset/sap-ai-provider";
// ============================================================================

// ============================================================================
// NOTE: Import Path for Development vs Production
// ============================================================================
// This example uses relative imports for local development within this repo:
import { createSAPAIProvider } from "../src/index";

/**
 * Demonstrates single and batch embedding generation
 */
async function embeddingsExample() {
  console.log("📊 SAP AI Embeddings Example\n");

  // Verify AICORE_SERVICE_KEY is set for local development
  if (!process.env.AICORE_SERVICE_KEY && !process.env.VCAP_SERVICES) {
    console.warn("⚠️  Warning: AICORE_SERVICE_KEY environment variable not set.");
    console.warn("   Set it in your .env file or environment for local development.\n");
  }

  try {
    const provider = createSAPAIProvider();

    // ========================================
    // Single Embedding
    // ========================================
    console.log("🔢 Generating single embedding...\n");

    const { embedding } = await embed({
      model: provider.embedding("text-embedding-ada-002"),
      value: "What is machine learning and how does it work?",
    });

    console.log("✅ Single embedding generated:");
    console.log(`   Dimensions: ${String(embedding.length)}`);
    console.log(
      `   First 5 values: [${embedding
        .slice(0, 5)
        .map((v) => v.toFixed(6))
        .join(", ")}...]`,
    );

    // ========================================
    // Batch Embeddings
    // ========================================
    console.log("\n🔢 Generating batch embeddings...\n");

    const documents = [
      "Machine learning is a subset of artificial intelligence.",
      "Deep learning uses neural networks with many layers.",
      "Natural language processing helps computers understand text.",
      "Computer vision enables machines to interpret images.",
    ];

    const { embeddings } = await embedMany({
      model: provider.embedding("text-embedding-ada-002"),
      values: documents,
    });

    console.log(`✅ Generated ${String(embeddings.length)} embeddings:`);
    embeddings.forEach((emb, idx) => {
      console.log(
        `   [${String(idx)}] "${documents[idx].slice(0, 40)}..." → ${String(emb.length)} dimensions`,
      );
    });

    // ========================================
    // Similarity Calculation (Demo)
    // ========================================
    console.log("\n📐 Calculating cosine similarities...\n");

    // Calculate cosine similarity between embeddings
    const cosineSimilarity = (a: number[], b: number[]): number => {
      const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
      const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
      const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
      return dotProduct / (magnitudeA * magnitudeB);
    };

    // Compare each document to the first one
    console.log(`   Reference: "${documents[0].slice(0, 40)}..."`);
    for (let i = 1; i < embeddings.length; i++) {
      const similarity = cosineSimilarity(embeddings[0], embeddings[i]);
      console.log(`   → "${documents[i].slice(0, 35)}..." similarity: ${similarity.toFixed(4)}`);
    }

    // ========================================
    // Different Embedding Types
    // ========================================
    console.log("\n🏷️  Testing embedding types...\n");

    // Document embedding (for storage/indexing)
    const { embedding: docEmbedding } = await embed({
      model: provider.embedding("text-embedding-ada-002", {
        type: "document",
      }),
      value: "This is a document to be indexed for later retrieval.",
    });
    console.log(`   Document embedding: ${String(docEmbedding.length)} dimensions`);

    // Query embedding (for search queries)
    const { embedding: queryEmbedding } = await embed({
      model: provider.embedding("text-embedding-ada-002", {
        type: "query",
      }),
      value: "How do I retrieve documents?",
    });
    console.log(`   Query embedding: ${String(queryEmbedding.length)} dimensions`);

    console.log("\n✅ All embedding tests completed!");
  } catch (error: unknown) {
    if (error instanceof LoadAPIKeyError) {
      console.error("❌ Authentication Error:", error.message);
    } else if (error instanceof APICallError) {
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
    console.error("   - Verify the embedding model is available in your deployment");
  }
}

embeddingsExample().catch(console.error);

export { embeddingsExample };
