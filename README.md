# SAP AI Core Provider for Vercel AI SDK
[![npm](https://img.shields.io/npm/v/@mymediset/sap-ai-provider/latest?label=npm&color=blue)](https://www.npmjs.com/package/@mymediset/sap-ai-provider)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

A community provider for SAP AI Core that integrates seamlessly with the Vercel AI SDK. This provider enables you to use SAP's enterprise-grade AI models through the familiar Vercel AI SDK interface.

## Features

- 🔐 **Automatic OAuth Authentication** - Handles SAP AI Core authentication seamlessly
- 🎯 **Tool Calling Support** - Full function calling capabilities
- 🖼️ **Multi-modal Input** - Support for text and image inputs
- 📡 **Streaming Support** - Real-time text generation with Server-Sent Events
- 🏗️ **Structured Outputs** - JSON schema-based structured responses
- 🔧 **TypeScript Support** - Full type safety and IntelliSense
- 🎨 **Multiple Models** - Support for 40+ models including GPT-4, Claude, Gemini, and more

## Supported Models

The provider supports a wide range of models available in SAP AI Core:

### OpenAI Models
- `gpt-4`, `gpt-4o`, `gpt-4o-mini`
- `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
- `o1`, `o1-mini`, `o3`, `o3-mini`, `o4-mini`

### Anthropic Models
- `anthropic--claude-3-haiku`, `anthropic--claude-3-sonnet`, `anthropic--claude-3-opus`
- `anthropic--claude-3.5-sonnet`, `anthropic--claude-3.7-sonnet`
- `anthropic--claude-4-sonnet`, `anthropic--claude-4-opus`

### Google Models
- `gemini-1.5-pro`, `gemini-1.5-flash`
- `gemini-2.0-pro`, `gemini-2.0-flash`, `gemini-2.0-flash-thinking`, `gemini-2.0-flash-lite`
- `gemini-2.5-pro`, `gemini-2.5-flash`

### Amazon Models
- `amazon--nova-premier`, `amazon--nova-pro`, `amazon--nova-lite`, `amazon--nova-micro`
- `amazon--titan-text-lite`, `amazon--titan-text-express`

### Other Models
- `mistralai--mistral-large-instruct`, `mistralai--mistral-small-instruct`
- `meta--llama3-70b-instruct`, `meta--llama3.1-70b-instruct`
- And many more...

Note: Model availability may vary based on your SAP AI Core subscription and region. Some models may require additional configuration or permissions.

## Installation

```bash
npm install @mymediset/sap-ai-provider
```

## Quick Start

### 1. Get Your SAP AI Core Service Key

1. Go to your SAP BTP Cockpit
2. Navigate to your AI Core instance
3. Create a service key for your AI Core instance
4. Copy the service key JSON

### 2. Basic Usage (Direct Model API)

```typescript
import { createSAPAIProvider } from '@mymediset/sap-ai-provider';

// Create the provider with your service key
const provider = await createSAPAIProvider({
  serviceKey: 'your-sap-ai-core-service-key-json'
});

// Create a model instance
const model = provider('gpt-4o', {
  modelParams: {
    temperature: 0.7,
    maxTokens: 1000
  }
});

// Generate text
const result = await model.doGenerate({
  prompt: [{ 
    role: 'user', 
    content: [{ type: 'text', text: 'Hello, how are you?' }] 
  }]
});

// Extract text from content array
const text = result.content
  .filter(item => item.type === 'text')
  .map(item => item.text)
  .join('');

console.log(text);
```

### 3. Using with Vercel AI SDK (Recommended)

```typescript
import { generateText } from 'ai';
import { createSAPAIProvider } from '@mymediset/sap-ai-provider';

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY
});

const model = provider('gpt-4o');

const result = await generateText({
  model,
  prompt: 'Write a short story about a robot learning to paint.'
});

console.log(result.text);
```

## Advanced Features

### Tool Calling (Function Calling)

```typescript
import { generateText } from 'ai';
import { createSAPAIProvider } from '@mymediset/sap-ai-provider';
import { tool } from 'ai';
import { z } from 'zod';

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY
});

const result = await generateText({
  model: provider('gpt-4o'),
  messages: [
    { role: 'user', content: 'What\'s the weather like in Tokyo?' }
  ],
  tools: {
    get_weather: tool({
      description: 'Get the current weather for a location',
      parameters: z.object({
        location: z.string().describe('The city and state, e.g. San Francisco, CA')
      }),
      execute: async ({ location }) => {
        // Your weather API implementation
        return `The weather in ${location} is sunny and 25°C`;
      }
    })
  }
});

console.log(result.text);
```

### Multi-modal Input (Images)

```typescript
import { generateText } from 'ai';
import { createSAPAIProvider } from '@mymediset/sap-ai-provider';

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY
});

const result = await generateText({
  model: provider('gpt-4o'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What do you see in this image?' },
        { type: 'image', image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...' }
      ]
    }
  ]
});

console.log(result.text);
```

### Streaming

```typescript
import { streamText } from 'ai';
import { createSAPAIProvider } from '@mymediset/sap-ai-provider';

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY
});

const result = await streamText({
  model: provider('gpt-4o'),
  prompt: 'Write a poem about AI.'
});

for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

### Structured Outputs

```typescript
import { generateObject } from 'ai';
import { createSAPAIProvider } from '@mymediset/sap-ai-provider';
import { z } from 'zod';

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY
});

const result = await generateObject({
  model: provider('gpt-4o'),
  prompt: 'Extract the name, age, and email from: John Doe, 30 years old, john@example.com',
  schema: z.object({
    name: z.string(),
    age: z.number(),
    email: z.string()
  })
});

console.log(result.object);
```

## Configuration Options

### Provider Settings

```typescript
interface SAPAIProviderSettings {
  serviceKey?: string;        // SAP AI Core service key JSON
  token?: string;             // Direct access token (alternative to serviceKey)
  baseURL?: string;           // Custom base URL for API calls
  deploymentId?: string;      // SAP AI Core deployment ID (default: 'd65d81e7c077e583')
  resourceGroup?: string;     // SAP AI Core resource group (default: 'default')
}
```

### Deployment Configuration

The SAP AI provider uses deployment IDs and resource groups to manage model deployments in SAP AI Core:

#### Deployment ID
- A unique identifier for your model deployment in SAP AI Core
- Default: 'd65d81e7c077e583' (general-purpose deployment)
- Can be found in your SAP AI Core deployment details
- Set via `deploymentId` option or `SAP_AI_DEPLOYMENT_ID` environment variable

#### Resource Group
- Logical grouping of AI resources in SAP AI Core
- Default: 'default'
- Used for resource isolation and access control
- Set via `resourceGroup` option or `SAP_AI_RESOURCE_GROUP` environment variable

Example with custom deployment:
```typescript
const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY,
  deploymentId: 'your-custom-deployment-id',
  resourceGroup: 'your-resource-group'
});
```

### Model Settings

```typescript
interface SAPAISettings {
  modelVersion?: string;      // Specific model version
  modelParams?: {
    maxTokens?: number;       // Maximum tokens to generate
    temperature?: number;     // Sampling temperature (0-2)
    topP?: number;           // Nucleus sampling parameter
    frequencyPenalty?: number; // Frequency penalty (-2 to 2)
    presencePenalty?: number;  // Presence penalty (-2 to 2)
    n?: number;              // Number of completions
  };
  safePrompt?: boolean;       // Enable safe prompt filtering
  structuredOutputs?: boolean; // Enable structured outputs
}
```

## Environment Variables

```bash
# Required: Your SAP AI Core service key
SAP_AI_SERVICE_KEY='{"serviceurls":{"AI_API_URL":"..."},"clientid":"...","clientsecret":"..."}'

# Optional: Direct access token (alternative to service key)
SAP_AI_TOKEN='your-access-token'

# Optional: Custom base URL
SAP_AI_BASE_URL='https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com'
```

## Error Handling

The provider includes comprehensive error handling with detailed error messages and automatic retries for certain error types.

### Error Types

```typescript
class SAPAIError extends Error {
  code?: number;           // Error code from SAP AI Core
  location?: string;       // Where the error occurred
  requestId?: string;      // Request ID for tracking
  details?: string;        // Additional error details
  response?: Response;     // Raw HTTP response
}
```

### Common Error Codes

| HTTP Status | Description | Retry? | Common Causes |
|------------|-------------|--------|---------------|
| 400 | Bad Request | No | Invalid parameters, malformed request |
| 401 | Unauthorized | No | Invalid/expired token, wrong credentials |
| 403 | Forbidden | No | Insufficient permissions, wrong resource group |
| 404 | Not Found | No | Invalid model ID, deployment ID |
| 429 | Too Many Requests | Yes | Rate limit exceeded |
| 500 | Internal Server Error | Yes | SAP AI Core service issue |
| 502 | Bad Gateway | Yes | Network/proxy issue |
| 503 | Service Unavailable | Yes | Service temporarily down |
| 504 | Gateway Timeout | Yes | Request timeout |

### Error Handling Examples

Basic error handling:
```typescript
import { SAPAIError } from '@mymediset/sap-ai-provider';

try {
  const result = await generateText({
    model: provider('gpt-4o'),
    prompt: 'Hello world'
  });
} catch (error) {
  if (error instanceof SAPAIError) {
    console.error('Error Code:', error.code);
    console.error('Request ID:', error.requestId);
    console.error('Location:', error.location);
    console.error('Details:', error.details);
    
    // Handle specific error types
    if (error.code === 429) {
      console.log('Rate limit exceeded - retrying after delay...');
    } else if (error.code === 401) {
      console.log('Authentication failed - check credentials');
    }
  }
}
```

### Best Practices

1. Use streaming for long responses to avoid token limits
2. Implement request queuing for high-volume applications
3. Monitor usage and adjust rate limits as needed
4. Cache responses when possible
5. Use batch requests efficiently

## Examples

Check out the [examples directory](./examples) for complete working examples:

- [Simple Chat Completion](./examples/example-simple-chat-completion.ts)
- [Tool Calling](./examples/example-chat-completion-tool.ts)
- [Image Recognition](./examples/example-image-recognition.ts)
- [Text Generation](./examples/example-generate-text.ts)

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Type Checking

```bash
npm run type-check
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

Apache License 2.0 - see [LICENSE](LICENSE.md) for details.

## Support

- 📖 [Documentation](https://github.com/BITASIA/sap-ai-provider)
- 🐛 [Issue Tracker](https://github.com/BITASIA/sap-ai-provider/issues)

## Related

- [Vercel AI SDK](https://sdk.vercel.ai/) - The AI SDK this provider extends
- [SAP AI Core Documentation](https://help.sap.com/docs/ai-core) - Official SAP AI Core docs
- [SAP BTP](https://www.sap.com/products/technology-platform.html) - SAP Business Technology Platform 