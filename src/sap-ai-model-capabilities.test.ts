/** Unit tests for SAP AI Model Capabilities detection. */

import { describe, expect, it } from "vitest";

import {
  getModelVendor,
  getSAPAIModelCapabilities,
  modelSupports,
  type SAPAIModelCapabilities,
  type SAPAIModelVendor,
} from "./sap-ai-model-capabilities";

describe("sap-ai-model-capabilities", () => {
  describe("getModelVendor", () => {
    it.each<{ expected: "unknown" | SAPAIModelVendor; modelId: string }>([
      { expected: "aicore", modelId: "aicore--llama-3.1-70b" },
      { expected: "amazon", modelId: "amazon--nova-pro" },
      { expected: "amazon", modelId: "amazon--titan-text-express" },
      { expected: "anthropic", modelId: "anthropic--claude-3.5-sonnet" },
      { expected: "anthropic", modelId: "anthropic--claude-2.1" },
      { expected: "azure", modelId: "azure--gpt-4o" },
      { expected: "azure", modelId: "azure--gpt-4-turbo" },
      { expected: "google", modelId: "google--gemini-2.0-flash" },
      { expected: "google", modelId: "google--gemini-1.0-pro" },
      { expected: "meta", modelId: "meta--llama-3.1-70b" },
      { expected: "meta", modelId: "meta--llama-2-70b" },
      { expected: "mistral", modelId: "mistral--mistral-large" },
      { expected: "mistral", modelId: "mistral--mistral-small" },
    ])("should return '$expected' for model '$modelId'", ({ expected, modelId }) => {
      expect(getModelVendor(modelId)).toBe(expected);
    });

    it.each([
      "gpt-4o",
      "claude-3.5-sonnet",
      "gemini-2.0-flash",
      "unknown-model",
      "",
      "no-double-dash",
    ])("should return 'unknown' for model without vendor prefix: '%s'", (modelId) => {
      expect(getModelVendor(modelId)).toBe("unknown");
    });

    it("should be case-insensitive for vendor extraction", () => {
      expect(getModelVendor("Amazon--Nova-Pro")).toBe("amazon");
      expect(getModelVendor("ANTHROPIC--CLAUDE-3")).toBe("anthropic");
    });

    it("should return 'unknown' for unrecognized vendor prefixes", () => {
      expect(getModelVendor("foobar--some-model")).toBe("unknown");
      expect(getModelVendor("openai--gpt-4")).toBe("unknown");
    });
  });

  describe("getSAPAIModelCapabilities", () => {
    describe("default capabilities", () => {
      it("should return all capabilities enabled for unknown models", () => {
        const capabilities = getSAPAIModelCapabilities("unknown-model");

        expect(capabilities).toEqual({
          defaultSystemMessageMode: "system",
          supportsImageInputs: true,
          supportsN: true,
          supportsParallelToolCalls: true,
          supportsStreaming: true,
          supportsStructuredOutputs: true,
          supportsToolCalls: true,
          vendor: "unknown",
        } satisfies SAPAIModelCapabilities);
      });
    });

    describe("vendor-specific capabilities", () => {
      it("should disable supportsN for Amazon models", () => {
        const capabilities = getSAPAIModelCapabilities("amazon--nova-pro");

        expect(capabilities.supportsN).toBe(false);
        expect(capabilities.vendor).toBe("amazon");
        // Other capabilities should be enabled
        expect(capabilities.supportsToolCalls).toBe(true);
        expect(capabilities.supportsStreaming).toBe(true);
      });

      it("should disable supportsN for Anthropic models", () => {
        const capabilities = getSAPAIModelCapabilities("anthropic--claude-3.5-sonnet");

        expect(capabilities.supportsN).toBe(false);
        expect(capabilities.vendor).toBe("anthropic");
        expect(capabilities.supportsToolCalls).toBe(true);
        expect(capabilities.supportsParallelToolCalls).toBe(true);
      });

      it("should disable supportsStructuredOutputs for AI Core models", () => {
        const capabilities = getSAPAIModelCapabilities("aicore--llama-3.1-70b");

        expect(capabilities.supportsStructuredOutputs).toBe(false);
        expect(capabilities.vendor).toBe("aicore");
        expect(capabilities.supportsN).toBe(true);
      });

      it("should disable supportsStructuredOutputs for Meta models", () => {
        const capabilities = getSAPAIModelCapabilities("meta--llama-3.1-70b");

        expect(capabilities.supportsStructuredOutputs).toBe(false);
        expect(capabilities.vendor).toBe("meta");
      });

      it("should have all capabilities enabled for Azure models", () => {
        const capabilities = getSAPAIModelCapabilities("azure--gpt-4o");

        expect(capabilities.supportsN).toBe(true);
        expect(capabilities.supportsStructuredOutputs).toBe(true);
        expect(capabilities.supportsToolCalls).toBe(true);
        expect(capabilities.supportsParallelToolCalls).toBe(true);
        expect(capabilities.vendor).toBe("azure");
      });

      it("should have all capabilities enabled for Google models", () => {
        const capabilities = getSAPAIModelCapabilities("google--gemini-2.0-flash");

        expect(capabilities.supportsN).toBe(true);
        expect(capabilities.supportsStructuredOutputs).toBe(true);
        expect(capabilities.vendor).toBe("google");
      });

      it("should have all capabilities enabled for Mistral models", () => {
        const capabilities = getSAPAIModelCapabilities("mistral--mistral-large");

        expect(capabilities.supportsN).toBe(true);
        expect(capabilities.vendor).toBe("mistral");
      });
    });

    describe("model-specific overrides", () => {
      describe("Claude 2.x models", () => {
        it.each(["anthropic--claude-2", "anthropic--claude-2.0", "anthropic--claude-2.1"])(
          "should have limited capabilities for %s",
          (modelId) => {
            const capabilities = getSAPAIModelCapabilities(modelId);

            expect(capabilities.supportsN).toBe(false); // From vendor
            expect(capabilities.supportsParallelToolCalls).toBe(false); // Model override
            expect(capabilities.supportsStructuredOutputs).toBe(false); // Model override
            expect(capabilities.supportsToolCalls).toBe(true); // Not disabled
          },
        );
      });

      describe("Amazon Titan models", () => {
        it.each(["amazon--titan-text-express", "amazon--titan-text-lite", "amazon--titan-embed"])(
          "should have limited capabilities for %s",
          (modelId) => {
            const capabilities = getSAPAIModelCapabilities(modelId);

            expect(capabilities.supportsN).toBe(false);
            expect(capabilities.supportsImageInputs).toBe(false);
            expect(capabilities.supportsParallelToolCalls).toBe(false);
            expect(capabilities.supportsStructuredOutputs).toBe(false);
            expect(capabilities.supportsToolCalls).toBe(false);
          },
        );
      });

      describe("Llama 2 models", () => {
        it.each([
          "meta--llama-2-70b",
          "meta--llama-2-13b",
          "aicore--llama-2-70b-chat",
          "aicore--llama-2-13b-chat",
        ])("should have limited capabilities for %s", (modelId) => {
          const capabilities = getSAPAIModelCapabilities(modelId);

          expect(capabilities.supportsImageInputs).toBe(false);
          expect(capabilities.supportsStructuredOutputs).toBe(false);
          expect(capabilities.supportsToolCalls).toBe(false);
        });
      });

      describe("Llama 3.1+ models", () => {
        it.each(["meta--llama-3.1-70b", "meta--llama-3.2-90b", "aicore--llama-3.1-8b"])(
          "should support tools for %s",
          (modelId) => {
            const capabilities = getSAPAIModelCapabilities(modelId);

            expect(capabilities.supportsToolCalls).toBe(true);
            expect(capabilities.supportsImageInputs).toBe(false); // Still no vision
          },
        );
      });

      describe("Gemini 1.0 models", () => {
        it.each(["google--gemini-1.0-pro", "google--gemini-1.0-ultra"])(
          "should have limited structured output for %s",
          (modelId) => {
            const capabilities = getSAPAIModelCapabilities(modelId);

            expect(capabilities.supportsStructuredOutputs).toBe(false);
            expect(capabilities.supportsN).toBe(true); // Vendor default
          },
        );

        it("should have full capabilities for Gemini 1.5+", () => {
          const capabilities = getSAPAIModelCapabilities("google--gemini-1.5-pro");

          expect(capabilities.supportsStructuredOutputs).toBe(true);
          expect(capabilities.supportsN).toBe(true);
        });
      });

      describe("Mistral Small/Tiny models", () => {
        it.each(["mistral--mistral-small", "mistral--mistral-tiny"])(
          "should have limited structured output for %s",
          (modelId) => {
            const capabilities = getSAPAIModelCapabilities(modelId);

            expect(capabilities.supportsStructuredOutputs).toBe(false);
            expect(capabilities.supportsN).toBe(true);
          },
        );

        it("should have full capabilities for Mistral Large", () => {
          const capabilities = getSAPAIModelCapabilities("mistral--mistral-large");

          expect(capabilities.supportsStructuredOutputs).toBe(true);
        });
      });
    });

    describe("case insensitivity", () => {
      it("should handle mixed case model IDs", () => {
        const capabilities = getSAPAIModelCapabilities("Amazon--Nova-Pro");

        expect(capabilities.vendor).toBe("amazon");
        expect(capabilities.supportsN).toBe(false);
      });
    });
  });

  describe("modelSupports", () => {
    it("should return true for supported capabilities", () => {
      expect(modelSupports("azure--gpt-4o", "supportsN")).toBe(true);
      expect(modelSupports("azure--gpt-4o", "supportsToolCalls")).toBe(true);
      expect(modelSupports("azure--gpt-4o", "supportsStructuredOutputs")).toBe(true);
    });

    it("should return false for unsupported capabilities", () => {
      expect(modelSupports("amazon--nova-pro", "supportsN")).toBe(false);
      expect(modelSupports("anthropic--claude-3.5-sonnet", "supportsN")).toBe(false);
      expect(modelSupports("amazon--titan-text-express", "supportsToolCalls")).toBe(false);
    });

    it("should work with all boolean capability keys", () => {
      const modelId = "azure--gpt-4o";

      expect(typeof modelSupports(modelId, "supportsImageInputs")).toBe("boolean");
      expect(typeof modelSupports(modelId, "supportsN")).toBe("boolean");
      expect(typeof modelSupports(modelId, "supportsParallelToolCalls")).toBe("boolean");
      expect(typeof modelSupports(modelId, "supportsStreaming")).toBe("boolean");
      expect(typeof modelSupports(modelId, "supportsStructuredOutputs")).toBe("boolean");
      expect(typeof modelSupports(modelId, "supportsToolCalls")).toBe("boolean");
    });
  });
});
