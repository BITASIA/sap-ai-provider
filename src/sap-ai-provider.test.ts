import { describe, it, expect } from "vitest";
import { createSAPAIProvider, sapai } from "./sap-ai-provider";

describe("createSAPAIProvider", () => {
  it("should create a provider synchronously", () => {
    const provider = createSAPAIProvider();
    expect(provider).toBeDefined();
    expect(typeof provider).toBe("function");

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

  it("should create model via chat method with optional settings", () => {
    const provider = createSAPAIProvider();
    const model = provider.chat("gpt-4o");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gpt-4o");
    expect(model.provider).toBe("sap-ai");

    // Also works with settings
    const modelWithSettings = provider.chat("gpt-4o", {
      modelParams: { temperature: 0.8 },
    });
    expect(modelWithSettings).toBeDefined();
  });

  it("should accept resource group configuration", () => {
    const provider = createSAPAIProvider({
      resourceGroup: "production",
    });

    expect(provider("gpt-4o")).toBeDefined();
  });

  it("should accept default settings", () => {
    const provider = createSAPAIProvider({
      defaultSettings: {
        modelParams: {
          temperature: 0.5,
        },
      },
    });

    expect(provider("gpt-4o")).toBeDefined();
  });

  it("should accept deploymentId configuration", () => {
    const provider = createSAPAIProvider({
      deploymentId: "d65d81e7c077e583",
    });

    expect(provider("gpt-4o")).toBeDefined();
  });

  it("should accept custom destination configuration", () => {
    const provider = createSAPAIProvider({
      destination: {
        url: "https://custom-ai-core.example.com",
      },
    });

    expect(provider("gpt-4o")).toBeDefined();
  });

  it("should accept both deploymentId and destination together", () => {
    const provider = createSAPAIProvider({
      deploymentId: "d65d81e7c077e583",
      destination: {
        url: "https://custom-ai-core.example.com",
      },
    });

    expect(provider("gpt-4o")).toBeDefined();
  });

  it("should accept both deploymentId and resourceGroup", () => {
    const provider = createSAPAIProvider({
      deploymentId: "d65d81e7c077e583",
      resourceGroup: "production",
    });

    expect(provider("gpt-4o")).toBeDefined();
  });

  it("should merge per-call settings with defaults", () => {
    const provider = createSAPAIProvider({
      defaultSettings: {
        modelParams: {
          temperature: 0.5,
        },
      },
    });

    expect(
      provider("gpt-4o", {
        modelParams: {
          maxTokens: 1000,
        },
      }),
    ).toBeDefined();
  });

  it("should throw when called with new keyword", () => {
    const provider = createSAPAIProvider();
    expect(() => {
      // @ts-expect-error - Testing runtime behavior
      new provider("gpt-4o");
    }).toThrow("cannot be called with the new keyword");
  });
});

describe("sapai default provider", () => {
  it("should expose provider and chat entrypoints", () => {
    expect(sapai).toBeDefined();
    expect(typeof sapai).toBe("function");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(sapai.chat).toBeDefined();
    expect(typeof sapai.chat).toBe("function");
  });

  it("should create a model", () => {
    const model = sapai("gpt-4o");
    expect(model).toBeDefined();
    expect(model.modelId).toBe("gpt-4o");
    expect(model.provider).toBe("sap-ai");
  });
});
