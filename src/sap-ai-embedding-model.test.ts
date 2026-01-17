/**
 * Unit tests for SAP AI Embedding Model
 *
 * Tests embedding model creation, configuration, and doEmbed behavior.
 */

import type { EmbeddingModelV3CallOptions } from "@ai-sdk/provider";

import { TooManyEmbeddingValuesForCallError } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";

import { SAPAIEmbeddingModel } from "./sap-ai-embedding-model.js";

// Mock the SAP AI SDK OrchestrationEmbeddingClient
vi.mock("@sap-ai-sdk/orchestration", () => {
  class MockOrchestrationEmbeddingClient {
    static embedError: Error | undefined;
    static embedResponse:
      | undefined
      | {
          getEmbeddings: () => { embedding: number[] | string; index: number; object: string }[];
          getTokenUsage: () => { prompt_tokens: number; total_tokens: number };
        };

    // Track constructor arguments
    static lastConstructorCall:
      | undefined
      | {
          config: { embeddings: { model: { name: string; params?: Record<string, unknown> } } };
          deploymentConfig: unknown;
          destination: unknown;
        };

    // Track the last call arguments for verification
    static lastEmbedCall:
      | undefined
      | {
          request: { input: string[]; type?: string };
          requestConfig?: { signal?: AbortSignal };
        };

    embed = vi
      .fn()
      .mockImplementation(
        (request: { input: string[]; type?: string }, requestConfig?: { signal?: AbortSignal }) => {
          MockOrchestrationEmbeddingClient.lastEmbedCall = { request, requestConfig };

          const errorToThrow = MockOrchestrationEmbeddingClient.embedError;
          if (errorToThrow) {
            MockOrchestrationEmbeddingClient.embedError = undefined;
            throw errorToThrow;
          }

          if (MockOrchestrationEmbeddingClient.embedResponse) {
            const response = MockOrchestrationEmbeddingClient.embedResponse;
            MockOrchestrationEmbeddingClient.embedResponse = undefined;
            return Promise.resolve(response);
          }

          return Promise.resolve({
            getEmbeddings: () => [
              { embedding: [0.1, 0.2, 0.3], index: 0, object: "embedding" },
              { embedding: [0.4, 0.5, 0.6], index: 1, object: "embedding" },
            ],
            getTokenUsage: () => ({ prompt_tokens: 8, total_tokens: 8 }),
          });
        },
      );

    constructor(
      config: { embeddings: { model: { name: string; params?: Record<string, unknown> } } },
      deploymentConfig: unknown,
      destination: unknown,
    ) {
      MockOrchestrationEmbeddingClient.lastConstructorCall = {
        config,
        deploymentConfig,
        destination,
      };
    }
  }

  return {
    MockOrchestrationEmbeddingClient,
    OrchestrationEmbeddingClient: MockOrchestrationEmbeddingClient,
  };
});

/**
 * Helper to access the mock class for test manipulation.
 * @returns The mock client with static properties for test control
 */
async function getMockClient(): Promise<{
  MockOrchestrationEmbeddingClient: {
    embedError: Error | undefined;
    embedResponse:
      | undefined
      | {
          getEmbeddings: () => { embedding: number[] | string; index: number; object: string }[];
          getTokenUsage: () => { prompt_tokens: number; total_tokens: number };
        };
    lastConstructorCall:
      | undefined
      | {
          config: { embeddings: { model: { name: string; params?: Record<string, unknown> } } };
          deploymentConfig: unknown;
          destination: unknown;
        };
    lastEmbedCall:
      | undefined
      | {
          request: { input: string[]; type?: string };
          requestConfig?: { signal?: AbortSignal };
        };
  };
}> {
  const mod = await import("@sap-ai-sdk/orchestration");
  return mod as unknown as {
    MockOrchestrationEmbeddingClient: {
      embedError: Error | undefined;
      embedResponse:
        | undefined
        | {
            getEmbeddings: () => { embedding: number[] | string; index: number; object: string }[];
            getTokenUsage: () => { prompt_tokens: number; total_tokens: number };
          };
      lastConstructorCall:
        | undefined
        | {
            config: { embeddings: { model: { name: string; params?: Record<string, unknown> } } };
            deploymentConfig: unknown;
            destination: unknown;
          };
      lastEmbedCall:
        | undefined
        | {
            request: { input: string[]; type?: string };
            requestConfig?: { signal?: AbortSignal };
          };
    };
  };
}

describe("SAPAIEmbeddingModel", () => {
  const defaultConfig = {
    deploymentConfig: { resourceGroup: "default" },
    provider: "sap-ai",
  };

  describe("model properties", () => {
    it("should have correct specification version", () => {
      const model = new SAPAIEmbeddingModel("text-embedding-ada-002", {}, defaultConfig);
      expect(model.specificationVersion).toBe("v3");
    });

    it("should expose model ID and provider name", () => {
      const model = new SAPAIEmbeddingModel("text-embedding-3-small", {}, defaultConfig);
      expect(model.modelId).toBe("text-embedding-3-small");
      expect(model.provider).toBe("sap-ai");
    });

    it("should have default maxEmbeddingsPerCall of 2048", () => {
      const model = new SAPAIEmbeddingModel("text-embedding-ada-002", {}, defaultConfig);
      expect(model.maxEmbeddingsPerCall).toBe(2048);
    });

    it("should allow custom maxEmbeddingsPerCall via settings", () => {
      const model = new SAPAIEmbeddingModel(
        "text-embedding-ada-002",
        { maxEmbeddingsPerCall: 100 },
        defaultConfig,
      );
      expect(model.maxEmbeddingsPerCall).toBe(100);
    });

    it("should support parallel calls", () => {
      const model = new SAPAIEmbeddingModel("text-embedding-ada-002", {}, defaultConfig);
      expect(model.supportsParallelCalls).toBe(true);
    });
  });

  describe("doEmbed", () => {
    it("should generate embeddings with correct result structure", async () => {
      const model = new SAPAIEmbeddingModel("text-embedding-ada-002", {}, defaultConfig);
      const options: EmbeddingModelV3CallOptions = {
        values: ["Hello", "World"],
      };

      const result = await model.doEmbed(options);

      // Verify embeddings
      expect(result.embeddings).toHaveLength(2);
      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result.embeddings[1]).toEqual([0.4, 0.5, 0.6]);

      // Verify usage
      expect(result.usage).toBeDefined();
      expect(result.usage?.tokens).toBe(8);

      // Verify warnings (always empty array)
      expect(result.warnings).toEqual([]);

      // Verify provider metadata
      expect(result.providerMetadata).toBeDefined();
      expect(result.providerMetadata?.["sap-ai"]).toEqual({ model: "text-embedding-ada-002" });
    });

    it("should sort embeddings by index when returned out of order", async () => {
      const { MockOrchestrationEmbeddingClient } = await getMockClient();
      MockOrchestrationEmbeddingClient.embedResponse = {
        getEmbeddings: () => [
          { embedding: [0.7, 0.8, 0.9], index: 2, object: "embedding" },
          { embedding: [0.1, 0.2, 0.3], index: 0, object: "embedding" },
          { embedding: [0.4, 0.5, 0.6], index: 1, object: "embedding" },
        ],
        getTokenUsage: () => ({ prompt_tokens: 12, total_tokens: 12 }),
      };

      const model = new SAPAIEmbeddingModel("text-embedding-ada-002", {}, defaultConfig);
      const result = await model.doEmbed({ values: ["A", "B", "C"] });

      expect(result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
      expect(result.embeddings[1]).toEqual([0.4, 0.5, 0.6]);
      expect(result.embeddings[2]).toEqual([0.7, 0.8, 0.9]);
    });

    it("should throw TooManyEmbeddingValuesForCallError when exceeding limit", async () => {
      const model = new SAPAIEmbeddingModel(
        "text-embedding-ada-002",
        { maxEmbeddingsPerCall: 2 },
        defaultConfig,
      );

      await expect(model.doEmbed({ values: ["A", "B", "C"] })).rejects.toThrow(
        TooManyEmbeddingValuesForCallError,
      );
    });

    it("should pass abortSignal to SAP SDK", async () => {
      const { MockOrchestrationEmbeddingClient } = await getMockClient();
      const abortController = new AbortController();

      const model = new SAPAIEmbeddingModel("text-embedding-ada-002", {}, defaultConfig);
      await model.doEmbed({
        abortSignal: abortController.signal,
        values: ["Test"],
      });

      expect(MockOrchestrationEmbeddingClient.lastEmbedCall?.requestConfig).toBeDefined();
      expect(MockOrchestrationEmbeddingClient.lastEmbedCall?.requestConfig?.signal).toBe(
        abortController.signal,
      );
    });

    it("should not pass requestConfig when no abortSignal provided", async () => {
      const { MockOrchestrationEmbeddingClient } = await getMockClient();

      const model = new SAPAIEmbeddingModel("text-embedding-ada-002", {}, defaultConfig);
      await model.doEmbed({ values: ["Test"] });

      expect(MockOrchestrationEmbeddingClient.lastEmbedCall?.requestConfig).toBeUndefined();
    });
  });

  describe("embedding normalization", () => {
    it("should handle base64-encoded embeddings", async () => {
      const { MockOrchestrationEmbeddingClient } = await getMockClient();

      // Create a base64-encoded Float32Array
      const floats = new Float32Array([1.0, 2.0, 3.0]);
      const base64 = Buffer.from(floats.buffer).toString("base64");

      MockOrchestrationEmbeddingClient.embedResponse = {
        getEmbeddings: () => [{ embedding: base64, index: 0, object: "embedding" }],
        getTokenUsage: () => ({ prompt_tokens: 4, total_tokens: 4 }),
      };

      const model = new SAPAIEmbeddingModel("text-embedding-ada-002", {}, defaultConfig);
      const result = await model.doEmbed({ values: ["Test"] });

      expect(result.embeddings).toHaveLength(1);
      expect(result.embeddings[0]).toEqual([1.0, 2.0, 3.0]);
    });
  });

  describe("settings integration", () => {
    it("should pass embedding type to SDK", async () => {
      const { MockOrchestrationEmbeddingClient } = await getMockClient();

      const model = new SAPAIEmbeddingModel(
        "text-embedding-ada-002",
        { type: "document" },
        defaultConfig,
      );
      await model.doEmbed({ values: ["Test"] });

      expect(MockOrchestrationEmbeddingClient.lastEmbedCall?.request.type).toBe("document");
    });

    it("should use default type 'text' when not specified", async () => {
      const { MockOrchestrationEmbeddingClient } = await getMockClient();

      const model = new SAPAIEmbeddingModel("text-embedding-ada-002", {}, defaultConfig);
      await model.doEmbed({ values: ["Test"] });

      expect(MockOrchestrationEmbeddingClient.lastEmbedCall?.request.type).toBe("text");
    });

    it("should pass model params to SDK client constructor", async () => {
      const { MockOrchestrationEmbeddingClient } = await getMockClient();

      const model = new SAPAIEmbeddingModel(
        "text-embedding-3-large",
        { modelParams: { dimensions: 256 } },
        defaultConfig,
      );
      await model.doEmbed({ values: ["Test"] });

      expect(MockOrchestrationEmbeddingClient.lastConstructorCall?.config.embeddings.model).toEqual(
        {
          name: "text-embedding-3-large",
          params: { dimensions: 256 },
        },
      );
    });

    it("should not include params when modelParams not specified", async () => {
      const { MockOrchestrationEmbeddingClient } = await getMockClient();

      const model = new SAPAIEmbeddingModel("text-embedding-ada-002", {}, defaultConfig);
      await model.doEmbed({ values: ["Test"] });

      expect(MockOrchestrationEmbeddingClient.lastConstructorCall?.config.embeddings.model).toEqual(
        { name: "text-embedding-ada-002" },
      );
    });
  });

  describe("error handling", () => {
    it("should convert SAP errors to AI SDK errors", async () => {
      const { MockOrchestrationEmbeddingClient } = await getMockClient();
      MockOrchestrationEmbeddingClient.embedError = new Error("SAP API Error");

      const model = new SAPAIEmbeddingModel("text-embedding-ada-002", {}, defaultConfig);

      await expect(model.doEmbed({ values: ["Test"] })).rejects.toThrow();
    });
  });
});
