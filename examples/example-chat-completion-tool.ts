#!/usr/bin/env node

/**
 * SAP AI Provider - Tool Calling Example
 *
 * This example demonstrates tool/function calling with the SAP AI Provider
 * using the Vercel AI SDK's generateText function with tools.
 *
 * Due to AI SDK v6's Zod schema conversion issues, we define tool schemas
 * directly in SAP AI SDK format via provider settings.
 *
 * Authentication:
 * - On SAP BTP: Automatically uses service binding (VCAP_SERVICES)
 * - Locally: Set AICORE_SERVICE_KEY environment variable with your service key JSON
 */

// Load environment variables
import "dotenv/config";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";

import type { ChatCompletionTool } from "../src/index";

// ============================================================================
// NOTE: Import Path for Development vs Production
// ============================================================================
// This example uses relative imports for local development within this repo:
import { createSAPAIProvider } from "../src/index";
// In YOUR production project, use the published package instead:
// import { createSAPAIProvider, ChatCompletionTool } from "@mymediset/sap-ai-provider";
// ============================================================================

// Define tool schemas in SAP AI SDK format (proper JSON Schema)
// These are passed via provider settings to bypass AI SDK conversion issues
const calculatorToolDef: ChatCompletionTool = {
  function: {
    description: "Perform basic arithmetic operations",
    name: "calculate",
    parameters: {
      properties: {
        a: {
          description: "First operand",
          type: "number",
        },
        b: {
          description: "Second operand",
          type: "number",
        },
        operation: {
          description: "The arithmetic operation to perform",
          enum: ["add", "subtract", "multiply", "divide"],
          type: "string",
        },
      },
      required: ["operation", "a", "b"],
      type: "object",
    },
  },
  type: "function",
};

const weatherToolDef: ChatCompletionTool = {
  function: {
    description: "Get weather for a location",
    name: "getWeather",
    parameters: {
      properties: {
        location: {
          description: "The city or location to get weather for",
          type: "string",
        },
      },
      required: ["location"],
      type: "object",
    },
  },
  type: "function",
};

// Define Zod schemas for type-safe execute functions
const calculatorSchema = z.object({
  a: z.number(),
  b: z.number(),
  operation: z.enum(["add", "subtract", "multiply", "divide"]),
});

const weatherSchema = z.object({
  location: z.string(),
});

// Create AI SDK tools with execute functions
// The schema here is for validation, actual schema is passed via settings
const calculatorTool = tool({
  description: "Perform basic arithmetic operations",
  execute: (args: z.infer<typeof calculatorSchema>) => {
    const { a, b, operation } = args;
    switch (operation) {
      case "add":
        return String(a + b);
      case "divide":
        return b !== 0 ? String(a / b) : "Error: Division by zero";
      case "multiply":
        return String(a * b);
      case "subtract":
        return String(a - b);
      default:
        return "Unknown operation";
    }
  },
  inputSchema: calculatorSchema,
});

const weatherTool = tool({
  description: "Get weather for a location",
  execute: (args: z.infer<typeof weatherSchema>) => {
    const { location } = args;
    return `Weather in ${location}: sunny, 72°F`;
  },
  inputSchema: weatherSchema,
});

async function simpleToolExample() {
  console.log("🛠️  SAP AI Tool Calling Example\n");

  // Verify AICORE_SERVICE_KEY is set for local development
  if (!process.env.AICORE_SERVICE_KEY && !process.env.VCAP_SERVICES) {
    console.warn(
      "⚠️  Warning: AICORE_SERVICE_KEY environment variable not set.",
    );
    console.warn(
      "   Set it in your .env file or environment for local development.\n",
    );
  }

  const provider = createSAPAIProvider();

  // Create models with tools defined in settings (proper JSON Schema)
  // This bypasses AI SDK's Zod conversion issues
  const modelWithCalculator = provider("gpt-4o", {
    tools: [calculatorToolDef],
  });

  const modelWithWeather = provider("gpt-4o", {
    tools: [weatherToolDef],
  });

  const modelWithAllTools = provider("gpt-4o", {
    tools: [calculatorToolDef, weatherToolDef],
  });

  // Test 1: Calculator
  console.log("📱 Calculator Test");
  const result1 = await generateText({
    model: modelWithCalculator,
    prompt: "What is 15 + 27?",
    stopWhen: [stepCountIs(5)],
    tools: {
      calculate: calculatorTool,
    },
  });
  console.log("Answer:", result1.text);
  console.log("");

  // Test 2: Weather
  console.log("🌤️  Weather Test");
  const result2 = await generateText({
    model: modelWithWeather,
    prompt: "What's the weather in Tokyo?",
    stopWhen: [stepCountIs(5)],
    tools: {
      getWeather: weatherTool,
    },
  });
  console.log("Answer:", result2.text);
  console.log("");

  // Test 3: Multiple tools
  console.log("🔧 Multiple Tools Test");
  const result3 = await generateText({
    model: modelWithAllTools,
    prompt: "Calculate 8 * 7, then tell me about the weather in Paris",
    stopWhen: [stepCountIs(10)],
    tools: {
      calculate: calculatorTool,
      getWeather: weatherTool,
    },
  });
  console.log("Answer:", result3.text);

  console.log("\n✅ All tests completed!");
}

simpleToolExample().catch(console.error);
