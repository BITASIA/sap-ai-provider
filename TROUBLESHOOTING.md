# Troubleshooting Guide

This guide helps diagnose and resolve common issues when using the SAP AI Core Provider.

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

**Symptoms:**

- HTTP 401 Unauthorized errors
- "Invalid token" messages
- Provider fails to initialize

**Solutions:**

1. **Verify environment variable is set:**

   ```bash
   # On macOS/Linux
   echo $AICORE_SERVICE_KEY

   # On Windows (PowerShell)
   echo $env:AICORE_SERVICE_KEY
   ```

2. **Check service key format:**
   - Ensure `AICORE_SERVICE_KEY` contains valid JSON
   - Use a JSON validator to check syntax
   - Verify all required fields are present: `clientid`, `clientsecret`, `url`, `serviceurls`

3. **Test service key in code:**

   ```typescript
   import "dotenv/config";

   console.log("Service key loaded:", !!process.env.AICORE_SERVICE_KEY);

   // Parse to verify it's valid JSON
   try {
     const key = JSON.parse(process.env.AICORE_SERVICE_KEY || "{}");
     console.log("Service key URL:", key.serviceurls?.AI_API_URL);
   } catch (error) {
     console.error("Invalid service key JSON:", error);
   }
   ```

4. **Check token expiration:**
   - Service keys can expire - regenerate if necessary
   - Verify the token hasn't been revoked
   - On SAP BTP, confirm the service binding is still active

5. **Verify OAuth2 endpoint:**
   - Check that the `url` in service key points to the correct OAuth server
   - Ensure network access to the OAuth endpoint

### Problem: "Cannot find module 'dotenv'"

**Solution:**

Install the dotenv package:

```bash
npm install dotenv
```

Ensure your code includes:

```typescript
import "dotenv/config";
```

Place this at the top of your entry file (before any other imports).

### Problem: 403 Forbidden

**Symptoms:**

- HTTP 403 errors
- "Insufficient permissions" messages

**Solutions:**

1. Check that your service key has the necessary permissions
2. Verify the `AI-Resource-Group` header matches your deployment's resource group
3. Confirm your SAP BTP account has access to SAP AI Core
4. Check if the model requires special entitlements in your tenant

## API Errors

This section provides detailed troubleshooting steps for common API errors. For a complete error code reference with quick fixes, see [API Reference - Error Codes](./API_REFERENCE.md#error-codes).

**Common Error Categories:**

- [400 Bad Request](#problem-400-bad-request) - Invalid configuration or request
- [401 Unauthorized](#problem-authentication-failed-or-401-errors) / [403 Forbidden](#problem-403-forbidden) - Authentication issues
- [404 Not Found](#problem-404-modeldeployment-not-found) - Model or deployment doesn't exist
- [429 Rate Limit](#problem-429-rate-limit-exceeded) - Too many requests
- [500-504 Server Errors](#problem-500502503504-server-errors) - Service or network issues

### Problem: 400 Bad Request

**Common Causes:**

1. **Invalid model parameters:**
   - `temperature` out of range (0-2)
   - `maxTokens` exceeds model limit
   - Invalid `topP` or `frequencyPenalty` values

2. **Malformed request body:**
   - Invalid message format
   - Missing required fields
   - Incorrect tool definition schema

3. **Incompatible features:**
   - Using features not supported by the selected model
   - Mixing incompatible configuration options

**Solutions:**

- Validate your configuration against the TypeScript types
- Check the API Reference for valid parameter ranges
- Enable verbose logging to see the exact request being sent

### Problem: 429 Rate Limit Exceeded

**Solutions:**

1. **Implement exponential backoff:**
   - The provider has automatic retry logic for 429 errors
   - Add additional delay between requests if needed

2. **Use streaming for long outputs:**
   - Streaming reduces memory and can help with rate limits
   - Prefer `streamText` over `generateText` for lengthy responses

3. **Optimize request frequency:**
   - Batch requests when possible
   - Cache responses for repeated queries
   - Reduce `maxTokens` to stay within rate limits

### Problem: 500/502/503/504 Server Errors

**Solutions:**

1. **Automatic retries:**
   - The provider automatically retries server errors with exponential backoff
   - Wait for the retry logic to complete

2. **Check SAP AI Core status:**
   - Verify SAP AI Core service is operational
   - Check for maintenance windows or outages

3. **Reduce request complexity:**
   - Simplify prompts temporarily
   - Remove optional features (masking, filtering, etc.)
   - Test with minimal configuration

## Model and Deployment Issues

### Problem: 404 Model/Deployment Not Found

**Symptoms:**

- "Model not found" errors
- "Deployment not found" errors
- HTTP 404 responses

**Solutions:**

1. **Verify model availability:**
   - Check that the model ID is supported in your SAP AI Core tenant
   - Confirm the model is available in your region
   - See [API Reference - SAPAIModelId](./API_REFERENCE.md#sapaimodelid) for supported models

2. **Check resource group:**

   ```typescript
   const provider = createSAPAIProvider({
     resourceGroup: "default", // Must match your deployment's resource group
   });
   ```

3. **Verify deployment status:**
   - Ensure your SAP AI Core deployment is running
   - Check deployment ID if specified explicitly
   - Confirm the deployment is not stopped or deleted

4. **Test with a known-working model:**
   - Try `gpt-4o` or another commonly available model
   - If that works, the issue is model-specific availability

### Problem: Model doesn't support features

**Example:** "Tool calling not supported" or "Streaming not available"

**Solutions:**

1. **Check model capabilities:**
   - Not all models support all features
   - See model-specific documentation for limitations

2. **Switch models:**
   - Use `gpt-4o` or `gpt-4.1-mini` for full tool calling support
   - Avoid Gemini models if you need multiple function tools (currently limited to 1 tool)

3. **Adjust configuration:**
   - Remove unsupported features from your request
   - Use alternative approaches (e.g., JSON mode instead of structured outputs)

## Streaming Issues

### Problem: Streaming not working or incomplete

**Symptoms:**

- No chunks received
- Stream ends prematurely
- Chunks appear all at once instead of incrementally

**Solutions:**

1. **Iterate the stream correctly:**

   ```typescript
   import { streamText } from "ai";

   const result = streamText({
     model: provider("gpt-4o"),
     prompt: "Write a story",
   });

   // Correct: iterate over textStream
   for await (const chunk of result.textStream) {
     process.stdout.write(chunk);
   }
   ```

2. **Don't mix generateText and streamText:**
   - Use `streamText` for streaming
   - Use `generateText` for complete responses
   - Don't call both on the same request

3. **Check for buffering issues:**
   - Ensure your runtime doesn't buffer the output
   - In HTTP responses, set appropriate headers for streaming:
     ```typescript
     "Content-Type": "text/event-stream",
     "Cache-Control": "no-cache",
     "Connection": "keep-alive"
     ```

4. **Handle errors in stream:**
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

**Symptoms:**

- Model doesn't use defined tools
- No tool calls in response
- Model generates text instead of calling tools

**Solutions:**

1. **Improve tool descriptions:**

   ```typescript
   const weatherTool = tool({
     description: "Get current weather for a specific location", // Be specific!
     parameters: z.object({
       location: z
         .string()
         .describe("City name, e.g., 'Tokyo', 'San Francisco'"),
     }),
   });
   ```

2. **Make prompt more explicit:**

   ```typescript
   const result = await generateText({
     model: provider("gpt-4o"),
     prompt: "What's the weather in Tokyo? Use the weather tool to check.",
     tools: { getWeather: weatherTool },
   });
   ```

3. **Check model compatibility:**
   - Gemini models support only 1 function tool per request
   - Use OpenAI models (`gpt-4o`) for multiple tools
   - See [CURL_API_TESTING_GUIDE.md](./CURL_API_TESTING_GUIDE.md#tool-calling-function-calling) for model-specific limitations

### Problem: Tool execution errors

**Solutions:**

1. **Validate tool arguments:**

   ```typescript
   const tool = tool({
     parameters: weatherSchema,
     execute: async (args) => {
       // Validate before executing
       const validated = weatherSchema.parse(args);
       return await getWeather(validated.location);
     },
   });
   ```

2. **Handle tool errors gracefully:**

   ```typescript
   execute: async (args) => {
     try {
       return await performOperation(args);
     } catch (error) {
       return { error: error.message };
     }
   };
   ```

3. **Return structured data:**
   - Tools should return JSON-serializable data
   - Avoid returning complex objects or functions

## Performance Issues

### Problem: Slow response times

**Solutions:**

1. **Use streaming for long outputs:**

   ```typescript
   // Faster perceived performance
   const result = streamText({
     model: provider("gpt-4o"),
     prompt: "Write a long article",
   });
   ```

2. **Optimize model parameters:**
   - Set `maxTokens` to expected response size (not maximum)
   - Lower `temperature` for faster, more deterministic results
   - Use smaller models for simple tasks (`gpt-4o-mini`, `claude-3-haiku`)

3. **Reduce prompt size:**
   - Keep message history concise
   - Remove unnecessary context
   - Summarize long conversations periodically

4. **Use default settings:**
   ```typescript
   const provider = createSAPAIProvider({
     defaultSettings: {
       modelParams: {
         temperature: 0.7,
         maxTokens: 2000,
       },
     },
   });
   ```

### Problem: High token usage / costs

**Solutions:**

1. **Set appropriate maxTokens:**
   - Don't use unnecessarily large values
   - Estimate actual response length

2. **Optimize prompts:**
   - Be concise and specific
   - Remove redundant instructions
   - Use system messages effectively

3. **Monitor usage:**

   ```typescript
   const result = await generateText({
     model: provider("gpt-4o"),
     prompt: "Hello",
   });

   console.log("Tokens used:", result.usage);
   ```

## Debugging Tools

### Enable Verbose Logging

Set environment variable for detailed logs:

```bash
export DEBUG=sap-ai-provider:*
```

### Use cURL for Direct API Testing

Test the SAP AI Core API directly without the SDK:

```bash
# Get access token
ACCESS_TOKEN=$(curl -s -X POST "${AUTH_URL}/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -u "${CLIENT_ID}:${CLIENT_SECRET}" | jq -r '.access_token')

# Test API
curl --verbose \
  -X POST "${AI_API_URL}/v2/inference/deployments/${DEPLOYMENT_ID}/v2/completion" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "AI-Resource-Group: ${RESOURCE_GROUP}" \
  -d @request.json
```

See [CURL_API_TESTING_GUIDE.md](./CURL_API_TESTING_GUIDE.md) for comprehensive direct API testing instructions.

### Check Token Validity

Decode JWT token (without verification):

```bash
echo "$ACCESS_TOKEN" | cut -d. -f2 | base64 -d | jq .
```

Look for:

- `exp` - Expiration timestamp
- `subaccountid` - Tenant information
- `scope` - Permissions

### Test with Minimal Request

Start with the simplest possible configuration:

```typescript
import { generateText } from "ai";
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

const provider = createSAPAIProvider();

const result = await generateText({
  model: provider("gpt-4o"),
  prompt: "Hello",
});

console.log(result.text);
```

If this works, gradually add features to isolate the issue.

### Verify Configuration

```typescript
import "dotenv/config";

// Check environment
console.log("Node version:", process.version);
console.log("Service key set:", !!process.env.AICORE_SERVICE_KEY);

// Test service key parsing
try {
  const key = JSON.parse(process.env.AICORE_SERVICE_KEY || "{}");
  console.log("OAuth URL:", key.url);
  console.log("AI API URL:", key.serviceurls?.AI_API_URL);
  console.log("Client ID:", key.clientid?.substring(0, 8) + "...");
} catch (error) {
  console.error("Invalid service key:", error);
}
```

## Getting Help

If you're still experiencing issues after trying these solutions:

1. **Check the documentation:**
   - [README.md](./README.md) - Getting started and feature overview
   - [API_REFERENCE.md](./API_REFERENCE.md) - Complete API documentation
   - [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) - Authentication setup

2. **Review examples:**
   - Check the `examples/` directory for working code
   - Compare your code against provided examples

3. **Open an issue:**
   - [GitHub Issues](https://github.com/BITASIA/sap-ai-provider/issues)
   - Include error messages, code snippets, and environment details
   - Redact sensitive information (credentials, tokens)

4. **SAP Support:**
   - For SAP AI Core service issues, contact SAP Support
   - [SAP AI Core Documentation](https://help.sap.com/docs/ai-core)

## Related Documentation

- [README.md](./README.md) - Getting started and quick start guide
- [API_REFERENCE.md](./API_REFERENCE.md) - Complete API reference with error codes
- [ENVIRONMENT_SETUP.md](./ENVIRONMENT_SETUP.md) - Authentication and configuration
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Internal architecture and design
- [CURL_API_TESTING_GUIDE.md](./CURL_API_TESTING_GUIDE.md) - Direct API testing and debugging
