/**
 * Unit tests for SAP AI Provider Options
 *
 * Tests Zod schema validation for provider options passed via
 * `providerOptions['sap-ai']` in AI SDK calls.
 */

import { safeValidateTypes } from "@ai-sdk/provider-utils";
import { describe, expect, it } from "vitest";

import {
  SAP_AI_PROVIDER_NAME,
  sapAIEmbeddingProviderOptions,
  type SAPAIEmbeddingProviderOptions,
  sapAILanguageModelProviderOptions,
  type SAPAILanguageModelProviderOptions,
} from "./sap-ai-provider-options";

describe("SAP_AI_PROVIDER_NAME", () => {
  it("should have the correct provider name", () => {
    expect(SAP_AI_PROVIDER_NAME).toBe("sap-ai");
  });
});

describe("sapAILanguageModelProviderOptions", () => {
  // Helper to validate options using the schema
  const validateLanguageModelOptions = async (value: unknown) => {
    return safeValidateTypes({
      schema: sapAILanguageModelProviderOptions,
      value,
    });
  };

  describe("valid options", () => {
    it("should accept empty object", async () => {
      const result = await validateLanguageModelOptions({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({});
      }
    });

    it("should accept includeReasoning boolean", async () => {
      const result = await validateLanguageModelOptions({ includeReasoning: true });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ includeReasoning: true });
      }
    });

    it("should accept modelParams with temperature", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: { temperature: 0.7 },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ modelParams: { temperature: 0.7 } });
      }
    });

    it("should accept modelParams with all fields", async () => {
      const options = {
        includeReasoning: false,
        modelParams: {
          frequencyPenalty: 0.5,
          maxTokens: 1000,
          n: 1,
          parallel_tool_calls: true,
          presencePenalty: 0.3,
          temperature: 0.8,
          topP: 0.9,
        },
      };
      const result = await validateLanguageModelOptions(options);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(options);
      }
    });

    it("should allow passthrough of unknown modelParams fields", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: {
          customField: "custom-value",
          temperature: 0.5,
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({
          modelParams: {
            customField: "custom-value",
            temperature: 0.5,
          },
        });
      }
    });
  });

  describe("validation constraints", () => {
    it("should reject temperature below 0", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: { temperature: -0.1 },
      });
      expect(result.success).toBe(false);
    });

    it("should reject temperature above 2", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: { temperature: 2.1 },
      });
      expect(result.success).toBe(false);
    });

    it("should reject frequencyPenalty below -2", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: { frequencyPenalty: -2.1 },
      });
      expect(result.success).toBe(false);
    });

    it("should reject frequencyPenalty above 2", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: { frequencyPenalty: 2.1 },
      });
      expect(result.success).toBe(false);
    });

    it("should reject presencePenalty below -2", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: { presencePenalty: -2.1 },
      });
      expect(result.success).toBe(false);
    });

    it("should reject presencePenalty above 2", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: { presencePenalty: 2.1 },
      });
      expect(result.success).toBe(false);
    });

    it("should reject topP below 0", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: { topP: -0.1 },
      });
      expect(result.success).toBe(false);
    });

    it("should reject topP above 1", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: { topP: 1.1 },
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-positive maxTokens", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: { maxTokens: 0 },
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-integer maxTokens", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: { maxTokens: 100.5 },
      });
      expect(result.success).toBe(false);
    });

    it("should reject non-positive n", async () => {
      const result = await validateLanguageModelOptions({
        modelParams: { n: 0 },
      });
      expect(result.success).toBe(false);
    });

    it("should reject includeReasoning non-boolean", async () => {
      const result = await validateLanguageModelOptions({
        includeReasoning: "true",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("type inference", () => {
    it("should have correct TypeScript type", () => {
      // This is a compile-time check - if types are wrong, TypeScript will error
      const validOptions: SAPAILanguageModelProviderOptions = {
        includeReasoning: true,
        modelParams: {
          maxTokens: 100,
          temperature: 0.5,
        },
      };
      expect(validOptions).toBeDefined();
    });
  });
});

describe("sapAIEmbeddingProviderOptions", () => {
  // Helper to validate options using the schema
  const validateEmbeddingOptions = async (value: unknown) => {
    return safeValidateTypes({
      schema: sapAIEmbeddingProviderOptions,
      value,
    });
  };

  describe("valid options", () => {
    it("should accept empty object", async () => {
      const result = await validateEmbeddingOptions({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({});
      }
    });

    it("should accept type 'text'", async () => {
      const result = await validateEmbeddingOptions({ type: "text" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ type: "text" });
      }
    });

    it("should accept type 'query'", async () => {
      const result = await validateEmbeddingOptions({ type: "query" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ type: "query" });
      }
    });

    it("should accept type 'document'", async () => {
      const result = await validateEmbeddingOptions({ type: "document" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ type: "document" });
      }
    });

    it("should accept modelParams as record", async () => {
      const result = await validateEmbeddingOptions({
        modelParams: { dimensions: 1536 },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual({ modelParams: { dimensions: 1536 } });
      }
    });

    it("should accept all fields together", async () => {
      const options = {
        modelParams: { customParam: true, dimensions: 1536 },
        type: "query" as const,
      };
      const result = await validateEmbeddingOptions(options);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual(options);
      }
    });
  });

  describe("validation constraints", () => {
    it("should reject invalid type value", async () => {
      const result = await validateEmbeddingOptions({
        type: "invalid",
      });
      expect(result.success).toBe(false);
    });

    it("should reject type as number", async () => {
      const result = await validateEmbeddingOptions({
        type: 123,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("type inference", () => {
    it("should have correct TypeScript type", () => {
      // This is a compile-time check - if types are wrong, TypeScript will error
      const validOptions: SAPAIEmbeddingProviderOptions = {
        modelParams: { dimensions: 1536 },
        type: "query",
      };
      expect(validOptions).toBeDefined();
    });
  });
});
