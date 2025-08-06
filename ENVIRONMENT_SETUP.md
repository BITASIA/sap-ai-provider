# Environment Setup

## Setting up SAP_AI_SERVICE_KEY

To use the SAP AI provider with environment variables, you need to set up the `SAP_AI_SERVICE_KEY` environment variable.

### 1. Create a .env file

Create a `.env` file in your project root:

```bash
# .env
SAP_AI_SERVICE_KEY={"serviceurls":{"AI_API_URL":"https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com"},"appname":"your-app-name","clientid":"your-client-id","clientsecret":"your-client-secret","identityzone":"your-identity-zone","identityzoneid":"your-identity-zone-id","url":"https://your-auth-url.authentication.region.hana.ondemand.com","credential-type":"binding-secret"}
```

### 2. Get your service key from SAP BTP

1. Go to your SAP BTP cockpit
2. Navigate to your subaccount
3. Find your AI Core service instance
4. Create or view a service key
5. Copy the entire JSON and replace the placeholder in your `.env` file

### 3. Use in your code

With the environment variable set, you can now use the provider without passing the service key:

```typescript
import { createSAPAIProvider } from '@mymediset/sap-ai-provider';
import 'dotenv/config';

// This will use SAP_AI_SERVICE_KEY from environment
const provider = await createSAPAIProvider(
  serviceKey: process.env.SAP_AI_SERVICE_KEY
);

// Use with any model
const model = provider('gpt-4o');
```

### 4. Examples

All example files have been updated to use the environment variable approach:

- `example-generate-text.ts` - Basic text generation
- `example-image-recognition.ts` - Image analysis with vision models
- `example-simple-chat-completion.ts` - Simple chat completion
- `example-chat-completion-tool.ts` - Advanced tool calling and debugging

Simply set your `SAP_AI_SERVICE_KEY` and run any example:

```bash
npx tsx example-generate-text.ts
npx tsx example-image-recognition.ts
```

### 5. Alternative: Direct service key

You can still pass the service key directly if needed:

```typescript
const provider = await createSAPAIProvider({
  serviceKey: '{"serviceurls":...}', // your service key JSON
});
```

## Environment Variable Priority

The provider checks for credentials in this order:

1. `token` option (if provided)
2. `serviceKey` option (if provided)
3. `SAP_AI_SERVICE_KEY` environment variable
4. `SAP_AI_TOKEN` environment variable (for direct token)

## Security Note

- Never commit your `.env` file to version control
- Add `.env` to your `.gitignore` file
- Use proper secrets management in production environments
