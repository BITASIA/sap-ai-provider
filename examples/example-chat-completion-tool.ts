#!/usr/bin/env node

import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { createSAPAIProvider } from "../src/index";
import "dotenv/config";

const calculatorTool = tool({
  description: "Perform basic arithmetic operations",
  inputSchema: z.object({
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    a: z.number(),
    b: z.number(),
  }),
  execute: async ({ operation, a, b }) => {
    switch (operation) {
      case "add":
        return a + b;
      case "subtract":
        return a - b;
      case "multiply":
        return a * b;
      case "divide":
        return b !== 0 ? a / b : "Error: Division by zero";
    }
  },
});

const weatherTool = tool({
  description: "Get weather for a location",
  inputSchema: z.object({
    location: z.string(),
  }),
  execute: async ({ location }) => {
    return `Weather in ${location}: sunny, 72°F`;
  },
});

async function simpleToolExample() {
  console.log("🛠️  Simple SAP AI Tool Calling Example\n");

  const serviceKey = process.env.SAP_AI_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SAP_AI_SERVICE_KEY environment variable is required. Please set it in your .env file.",
    );
  }
  const provider = await createSAPAIProvider({
    serviceKey: serviceKey,
  });
  const model = provider("gpt-4o");

  // Test 1: Calculator
  console.log("📱 Calculator Test");
  const result1 = await generateText({
    model,
    prompt: "What is 15 + 27?",
    tools: { calculate: calculatorTool },
    stopWhen: [stepCountIs(3)],
  });
  console.log("Answer:", result1.text);
  console.log("");

  // Test 2: Weather
  console.log("🌤️  Weather Test");
  const result2 = await generateText({
    model,
    prompt: "What's the weather in Tokyo?",
    tools: { getWeather: weatherTool },
    stopWhen: [stepCountIs(3)],
  });
  console.log("Answer:", result2.text);
  console.log("");

  // Test 3: Multiple tools
  console.log("🔧 Multiple Tools Test");
  const result3 = await generateText({
    model,
    prompt: "Calculate 8 * 7, then tell me about the weather in Paris",
    tools: {
      calculate: calculatorTool,
      getWeather: weatherTool,
    },
    stopWhen: [stepCountIs(5)],
  });
  console.log("Answer:", result3.text);
  console.log("Total steps:", result3.steps.length);

  console.log("\n✅ All tests completed!");
}

simpleToolExample().catch(console.error);
