# Troubleshooting Guide

This guide helps diagnose and resolve common issues when using the SAP AI Core Provider.

## Quick Reference

| Issue                 | Section                                                               |
| --------------------- | --------------------------------------------------------------------- |
| 401 Unauthorized      | [Authentication Issues](#problem-authentication-failed-or-401-errors) |
| 403 Forbidden         | [Authentication Issues](#problem-403-forbidden)                       |
| 404 Not Found         | [Model and Deployment Issues](#problem-404-modeldeployment-not-found) |
| 400 Bad Request       | [API Errors](#problem-400-bad-request)                                |
| 429 Rate Limit        | [API Errors](#problem-429-rate-limit-exceeded)                        |
| 500-504 Server Errors | [API Errors](#problem-500502503504-server-errors)                     |
| Tools not called      | [Tool Calling Issues](#problem-tools-not-being-called)                |
| Stream issues         | [Streaming Issues](#problem-streaming-not-working-or-incomplete)      |
| Slow responses        | [Performance Issues](#problem-slow-response-times)                    |

## Table of Contents

- [Authentication Issues](#authentication-issues)
- [API Errors](#api-errors)
- [Model and Deployment Issues](#model-and-deployment-issues)
- [Streaming Issues](#streaming-issues)
- [Tool Calling Issues](#tool-calling-issues)
- [Performance Issues](#performance-issues)
- [Debugging Tools](#debugging-tools)

## Authentication Issues

### Problem: "Authentication failed" or 401 errors

**Symptoms:** HTTP 401, "Invalid token", provider fails to initialize

**Solutions:**

1. **Verify environment variable is set:**

   ```bash
   echo $AICORE_SERVICE_KEY  # macOS/Linux
   echo $env:AICORE_SERVICE_KEY  # Windows PowerShell
   ```

2. **Check service key validity** - Ensure JSON is valid and contains required fields

3. **→ See [Environment Setup Guide](./ENVIRONMENT_SETUP.md) for complete authentication setup**

### Problem: "Cannot find module 'dotenv'"

**Solution:** `npm install dotenv` and add `import "dotenv/config";` at top of entry file

### Problem: 403 Forbidden

**Symptoms:** HTTP 403, "Insufficient permissions"

**Solutions:**

1. Verify service key has necessary permissions
2. Check `AI-Resource-Group` header matches deployment
3. Confirm SAP BTP account has SAP AI Core access
4. Check model entitlements in tenant

## API Errors

For a complete error code reference, see [API Reference - Error Codes](./API_REFERENCE.md#error-codes).

### Problem: 400 Bad Request

**Common Causes:** Invalid model parameters (temperature, maxTokens), malformed request, incompatible features

**Solutions:**

- Validate configuration against TypeScript types
- Check API Reference for valid parameter ranges
- Enable verbose logging to see exact request

### Problem: 429 Rate Limit Exceeded

**Solutions:**

1. Provider has automatic retry with exponential backoff
2. Use `streamText` instead of `generateText` for long outputs
3. Batch requests, cache responses, reduce `maxTokens`

### Problem: 500/502/503/504 Server Errors

**Solutions:**

1. Provider automatically retries with exponential backoff
2. Check SAP AI Core service status
3. Reduce request complexity: simplify prompts, remove optional features

## Model and Deployment Issues

### Problem: 404 Model/Deployment Not Found

**Symptoms:** "Model not found", "Deployment not found", HTTP 404

**Solutions:**

1. **Verify model availability** in your SAP AI Core tenant/region ([supported models](./API_REFERENCE.md#sapaimodelid))
2. **Check resource group:**
   ```typescript
   const provider = createSAPAIProvider({
     resourceGroup: "default", // Must match deployment
   });
   ```
3. **Verify deployment status:** Ensure deployment is running, check deployment ID
4. **Test with known model:** Try `gpt-4o` - if it works, issue is model-specific

### Problem: Model doesn't support features

**Example:** "Tool calling not supported", "Streaming not available"

**Solutions:**

1. Check model-specific documentation for limitations
2. Use `gpt-4o` or `gpt-4.1-mini` for full tool calling (Gemini limited to 1 tool)
3. Remove unsupported features or use alternatives (JSON mode instead of structured outputs)

## Streaming Issues

### Problem: Streaming not working or incomplete

**Symptoms:** No chunks, stream ends early, chunks appear all at once

**Solutions:**

1. **Iterate correctly:**

   ```typescript
   import "dotenv/config"; // Load environment variables
   import { streamText } from "ai";

   const result = streamText({
     model: provider("gpt-4o"),
     prompt: "Write a story",
   });

   for await (const chunk of result.textStream) {
     process.stdout.write(chunk);
   }
   ```

2. **Don't mix:** Use `streamText` for streaming, `generateText` for complete responses

3. **Check buffering:** Set HTTP headers for streaming:

   ```typescript
   "Content-Type": "text/event-stream",
   "Cache-Control": "no-cache",
   "Connection": "keep-alive"
   ```

4. **Handle errors:**
   ```typescript
   try {
     for await (const chunk of result.textStream) {
       process.stdout.write(chunk);
     }
   } catch (error) {
     console.error("Stream error:", error);
   }
   ```

## Tool Calling Issues

### Problem: Tools not being called

**Symptoms:** Model doesn't use tools, generates text instead

**Solutions:**

1. **Improve descriptions:** Be specific in tool descriptions and parameter descriptions

   ```typescript
   const weatherTool = tool({
     description: "Get current weather for a specific location",
     parameters: z.object({
       location: z.string().describe("City name, e.g., 'Tokyo'"),
     }),
   });
   ```

2. **Make prompt explicit:** "What's the weather in Tokyo? Use the weather tool to check."

3. **Check compatibility:** Gemini supports only 1 tool per request. Use `gpt-4o` for multiple tools. [Model limitations](./CURL_API_TESTING_GUIDE.md#tool-calling-example)

### Problem: Tool execution errors

**Solutions:**

1. **Validate arguments:** Use schema validation before executing
2. **Handle errors gracefully:** Wrap execute in try-catch, return `{ error: message }`
3. **Return structured data:** JSON-serializable only, avoid complex objects

## Performance Issues

### Problem: Slow response times

**Solutions:**

1. Use `streamText` for long outputs (faster perceived performance)
2. Optimize params: Set `maxTokens` to expected size, lower `temperature`, use smaller models (`gpt-4o-mini`)
3. Reduce prompt size: Concise history, remove unnecessary context, summarize periodically

### Problem: High token usage / costs

**Solutions:**

1. Set appropriate `maxTokens` (estimate actual response length)
2. Optimize prompts: Be concise, remove redundancy, use system messages effectively
3. Monitor usage: `console.log(result.usage)`

## Debugging Tools

### Enable Verbose Logging

```bash
export DEBUG=sap-ai-provider:*
```

### Use cURL for Direct API Testing

See [CURL_API_TESTING_GUIDE.md](./CURL_API_TESTING_GUIDE.md) for comprehensive direct API testing.

### Check Token Validity

Decode JWT token:

```bash
echo "$ACCESS_TOKEN" | cut -d. -f2 | base64 -d | jq .
```

Check: `exp` (expiration), `subaccountid`, `scope`

### Test with Minimal Request

Start simple, add features gradually:

```typescript
import "dotenv/config"; // Load environment variables
import { generateText } from "ai";
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

const provider = createSAPAIProvider();
const result = await generateText({
  model: provider("gpt-4o"),
  prompt: "Hello",
});
console.log(result.text);
```

### Verify Configuration

```typescript
import "dotenv/config"; // Load environment variables
console.log("Node:", process.version);
console.log("Service key set:", !!process.env.AICORE_SERVICE_KEY);

const key = JSON.parse(process.env.AICORE_SERVICE_KEY || "{}");
console.log("OAuth URL:", key.url);
console.log("AI API URL:", key.serviceurls?.AI_API_URL);
```

## Getting Help

If issues persist:

1. **Check documentation:** [README](./README.md), [API_REFERENCE](./API_REFERENCE.md), [ENVIRONMENT_SETUP](./ENVIRONMENT_SETUP.md)
2. **Review examples:** Compare your code with `examples/` directory

3. **Open an issue:** [GitHub Issues](https://github.com/BITASIA/sap-ai-provider/issues) - Include error messages, code snippets (redact credentials)
4. **SAP Support:** For SAP AI Core service issues - [SAP AI Core Docs](https://help.sap.com/docs/ai-core)

## Related Documentation

- [README](./README.md) - Getting started
- [API_REFERENCE](./API_REFERENCE.md) - Complete API reference
- [ENVIRONMENT_SETUP](./ENVIRONMENT_SETUP.md) - Authentication setup
- [ARCHITECTURE](./ARCHITECTURE.md) - Internal architecture
- [CURL_API_TESTING_GUIDE](./CURL_API_TESTING_GUIDE.md) - Direct API testing
