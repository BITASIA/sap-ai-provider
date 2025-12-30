import { describe, it, expect } from "vitest";
import { createSAPAIProvider } from "./sap-ai-provider";

describe("createSAPAIProvider", () => {
  it("should create a provider synchronously", () => {
    const provider = createSAPAIProvider();
    expect(provider).toBeDefined();
    expect(typeof provider).toBe("function");
  });

  it("should have a chat method", () => {
    const provider = createSAPAIProvider();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(provider.chat).toBeDefined();
    expect(typeof provider.chat).toBe("function");
  });

  it("should create a model when called", () => {
    const provider = createSAPAIProvider();
    const model = provider("gpt-4o");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gpt-4o");
    expect(model.provider).toBe("sap-ai");
  });

  it("should accept resource group configuration", () => {
    const provider = createSAPAIProvider({
      resourceGroup: "production",
    });
    const model = provider("gpt-4o");
    expect(model).toBeDefined();
  });

  it("should accept default settings", () => {
    const provider = createSAPAIProvider({
      defaultSettings: {
        modelParams: {
          temperature: 0.5,
        },
      },
    });
    const model = provider("gpt-4o");
    expect(model).toBeDefined();
  });

  it("should merge per-call settings with defaults", () => {
    const provider = createSAPAIProvider({
      defaultSettings: {
        modelParams: {
          temperature: 0.5,
        },
      },
    });
    const model = provider("gpt-4o", {
      modelParams: {
        maxTokens: 1000,
      },
    });
    expect(model).toBeDefined();
  });

  it("should throw when called with new keyword", () => {
    const provider = createSAPAIProvider();
    expect(() => {
      // @ts-expect-error - Testing runtime behavior
      new provider("gpt-4o");
    }).toThrow("cannot be called with the new keyword");
  });
});
