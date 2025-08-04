# SAP AI Core Provider for Vercel AI SDK

[![npm version](https://badge.fury.io/js/@ai-sdk%2Fsap-ai.svg)](https://badge.fury.io/js/@ai-sdk%2Fsap-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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

## Installation

```bash
npm install @ai-sdk/sap-ai
```

## Quick Start

### 1. Get Your SAP AI Core Service Key

1. Go to your SAP BTP Cockpit
2. Navigate to your AI Core instance
3. Create a service key for your AI Core instance
4. Copy the service key JSON

### 2. Basic Usage

```typescript
import { createSAPAIProvider } from '@ai-sdk/sap-ai';

// Create the provider with your service key
const provider = await createSAPAIProvider({
  serviceKey: 'your-sap-ai-core-service-key-json'
});

// Create a model instance
const model = provider('gpt-4o', {
  temperature: 0.7,
  maxTokens: 1000
});

// Generate text
const result = await model.doGenerate({
  prompt: [{ 
    role: 'user', 
    content: [{ type: 'text', text: 'Hello, how are you?' }] 
  }],
  mode: { type: 'regular' },
  inputFormat: 'messages'
});

console.log(result.text);
```

### 3. Using with Vercel AI SDK

```typescript
import { generateText } from 'ai';
import { createSAPAIProvider } from '@ai-sdk/sap-ai';

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
import { createSAPAIProvider } from '@ai-sdk/sap-ai';
import { tool } from 'ai';

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY
});

const model = provider('gpt-4o', {
  tools: [
    tool({
      name: 'get_weather',
      description: 'Get the current weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA'
          }
        },
        required: ['location']
      }
    })
  ]
});

const result = await model.doGenerate({
  prompt: [{ 
    role: 'user', 
    content: [{ type: 'text', text: 'What\'s the weather like in Tokyo?' }] 
  }],
  mode: { 
    type: 'regular',
    tools: [
      tool({
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA'
            }
          },
          required: ['location']
        }
      })
    ]
  },
  inputFormat: 'messages'
});
```

### Multi-modal Input (Images)

```typescript
import { createSAPAIProvider } from '@ai-sdk/sap-ai';

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY
});

const model = provider('gpt-4o');

const result = await model.doGenerate({
  prompt: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What do you see in this image?' },
        { type: 'image', image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ...' }
      ]
    }
  ],
  mode: { type: 'regular' },
  inputFormat: 'messages'
});

console.log(result.text);
```

### Streaming

```typescript
import { createSAPAIProvider } from '@ai-sdk/sap-ai';

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY
});

const model = provider('gpt-4o');

const stream = await model.doStream({
  prompt: [{ 
    role: 'user', 
    content: [{ type: 'text', text: 'Write a poem about AI.' }] 
  }],
  mode: { type: 'regular' },
  inputFormat: 'messages'
});

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}
```

### Structured Outputs

```typescript
import { createSAPAIProvider } from '@ai-sdk/sap-ai';

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY
});

const model = provider('gpt-4o', {
  structuredOutputs: true
});

const result = await model.doGenerate({
  prompt: [{ 
    role: 'user', 
    content: [{ type: 'text', text: 'Extract the name, age, and email from: John Doe, 30 years old, john@example.com' }] 
  }],
  mode: { 
    type: 'regular',
    responseFormat: {
      type: 'json_object',
      schema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          email: { type: 'string' }
        },
        required: ['name', 'age', 'email']
      }
    }
  },
  inputFormat: 'messages'
});

console.log(JSON.parse(result.text));
```

## Configuration Options

### Provider Settings

```typescript
interface SAPAIProviderSettings {
  serviceKey?: string;        // SAP AI Core service key JSON
  token?: string;             // Direct access token (alternative to serviceKey)
  baseURL?: string;           // Custom base URL for API calls
}
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
  tools?: Array<{             // Tool definitions for function calling
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: any;
    };
  }>;
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

The provider includes comprehensive error handling with detailed error messages:

```typescript
import { SAPAIError } from '@ai-sdk/sap-ai';

try {
  const result = await model.doGenerate({...});
} catch (error) {
  if (error instanceof SAPAIError) {
    console.error('SAP AI Error:', error.message);
    console.error('Status Code:', error.statusCode);
    console.error('Request Body:', error.requestBodyValues);
  }
}
```

## Examples

Check out the [examples directory](./examples) for complete working examples:

- [Simple Chat Completion](./example-simple-chat-completion.ts)
- [Tool Calling](./example-chat-completion-tool.ts)
- [Image Recognition](./example-image-recognition.ts)
- [Text Generation](./example-generate-text.ts)

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

MIT License - see [LICENSE](LICENSE) for details.

## Support

- 📖 [Documentation](https://github.com/BITASIA/sap-ai-provider)
- 🐛 [Issue Tracker](https://github.com/BITASIA/sap-ai-provider/issues)

## Related

- [Vercel AI SDK](https://sdk.vercel.ai/) - The AI SDK this provider extends
- [SAP AI Core Documentation](https://help.sap.com/docs/ai-core) - Official SAP AI Core docs
- [SAP BTP](https://www.sap.com/products/technology-platform.html) - SAP Business Technology Platform 