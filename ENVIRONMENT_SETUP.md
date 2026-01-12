# Environment Setup

Complete guide for setting up authentication and environment configuration for the SAP AI Core Provider.

> **Quick Start:** For a shorter introduction, see the [README Quick Start](./README.md#quick-start).
> **API Details:** For configuration options, see [API Reference - SAPAIProviderSettings](./API_REFERENCE.md#sapaiprovidersettings).

## Setting up AICORE_SERVICE_KEY (v2.0+)

Starting with version 2.0, the SAP AI provider uses the **SAP AI SDK** for authentication, which automatically handles credentials from environment variables or SAP BTP service bindings.

### 1. Create a .env file

Create a `.env` file in your project root:

```bash
# .env
AICORE_SERVICE_KEY={"serviceurls":{"AI_API_URL":"https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com"},"appname":"your-app-name","clientid":"your-client-id","clientsecret":"your-client-secret","identityzone":"your-identity-zone","identityzoneid":"your-identity-zone-id","url":"https://your-auth-url.authentication.region.hana.ondemand.com","credential-type":"binding-secret"}
```

**Important:** The environment variable name changed from `SAP_AI_SERVICE_KEY` (v1.x) to `AICORE_SERVICE_KEY` (v2.0+) to align with SAP AI SDK conventions.

### 2. Get your service key from SAP BTP

1. Go to your SAP BTP cockpit
2. Navigate to your subaccount
3. Find your AI Core service instance
4. Create or view a service key
5. Copy the entire JSON and set it as the value of `AICORE_SERVICE_KEY` in your `.env` file

### 3. Use in your code

With the environment variable set, the provider will automatically authenticate:

```typescript
import "dotenv/config"; // Load environment variables
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

// Authentication is automatic via AICORE_SERVICE_KEY environment variable
const provider = createSAPAIProvider();

// Use with any model
const model = provider("gpt-4o");
```

**Key changes in v2.0:**

- Provider creation is **synchronous** (no `await` needed)
- No need to pass `serviceKey` as a parameter
- Authentication is handled automatically by SAP AI SDK

### 4. Examples

All example files use the automatic authentication approach:

- `example-generate-text.ts` - Basic text generation
- `example-image-recognition.ts` - Image analysis with vision models
- `example-simple-chat-completion.ts` - Simple chat completion
- `example-chat-completion-tool.ts` - Advanced tool calling and debugging
- `example-data-masking.ts` - Data masking with DPI
- `example-streaming-chat.ts` - Streaming responses

Simply set your `AICORE_SERVICE_KEY` and run any example:

```bash
npx tsx examples/example-generate-text.ts
npx tsx examples/example-image-recognition.ts
```

## Authentication Methods

The SAP AI SDK checks for credentials in this order:

1. **`AICORE_SERVICE_KEY`** environment variable (recommended for local development)
2. **`VCAP_SERVICES`** environment variable (automatic on SAP BTP with service bindings)
3. **Destination configuration** (if provided to the provider)

## On SAP BTP (Cloud Foundry)

When running on SAP BTP with a service binding, authentication is **completely automatic** - no environment variables needed:

```typescript
import { createSAPAIProvider } from "@mymediset/sap-ai-provider";

// Automatically uses VCAP_SERVICES from service binding
const provider = createSAPAIProvider();
const model = provider("gpt-4o");
```

## Troubleshooting

### Common Authentication Issues

**Problem: "Authentication failed" or 401 errors**

Solutions:

- Verify `AICORE_SERVICE_KEY` is set correctly in `.env`
- Ensure the JSON is valid (use a JSON validator)
- Check that the service key hasn't expired
- On SAP BTP, verify the service binding is active

**Problem: "Cannot find module 'dotenv'"**

Solution:

```bash
npm install dotenv
```

Ensure your code includes:

```typescript
import "dotenv/config"; // Load environment variables
```

**Problem: "Deployment not found" or 404 errors**

Solutions:

- Verify your SAP AI Core deployment is running
- Check the `resourceGroup` matches your deployment
- Confirm the model ID is available in your region

### Checking Your Configuration

Verify environment variable is set:

```bash
# On macOS/Linux
echo $AICORE_SERVICE_KEY

# On Windows (PowerShell)
echo $env:AICORE_SERVICE_KEY
```

Test your service key:

```typescript
import "dotenv/config"; // Load environment variables

console.log("Service key loaded:", !!process.env.AICORE_SERVICE_KEY);
```

## Security Note

- Never commit your `.env` file to version control
- Add `.env` to your `.gitignore` file
- Use proper secrets management in production environments
- Rotate service keys regularly
- Use separate service keys for development and production

## Related Documentation

- [README.md](./README.md#authentication) - Quick authentication overview
- [API_REFERENCE.md](./API_REFERENCE.md#sapaiprovidersettings) - Configuration options
- [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md#authentication-changes) - Authentication changes in v2.0
