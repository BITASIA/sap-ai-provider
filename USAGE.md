# SAP AI Provider - Quick Usage Guide

## 🎯 What You Need

Just your **SAP AI Core service key** from SAP BTP. That's it!

## 🚀 Quick Start (3 steps)

### Step 1: Install dependencies
```bash
npm install ai
```

### Step 2: Get your service key
1. Go to **SAP BTP Cockpit**
2. Navigate to **Services** → **Instances and Subscriptions**  
3. Find your **SAP AI Core** service instance
4. Click on the service key (or create one)
5. **Copy the entire JSON** - that's your service key!

### Step 3: Use the provider
```typescript
import { createSAPAIProvider } from './sap-ai';
import { generateText } from 'ai';

// Your service key from SAP BTP (copy/paste as-is)
const serviceKey = `{
  "serviceurls": {"AI_API_URL": "https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com"},
  "clientid": "sb-d037951a-d81f-405d-a3c8-b6b55ec3ecb5!b499687|aicore!b540",
  "clientsecret": "1dcf6f55-faab-4dcb-8254-1a4448a0cc63$w8PqXEAf0CrAlGBK4H6xRSTZcWP7RBD6lKgJatsUmkE=",
  "url": "https://provider-dev-5dbg7fzn.authentication.eu10.hana.ondemand.com"
}`;

// Create provider (handles OAuth2 automatically)
const provider = await createSAPAIProvider({
  serviceKey,
  deploymentId: 'your-deployment-id'
});

// Use with Vercel AI SDK
const { text } = await generateText({
  model: provider('gpt-4o'),
  prompt: 'Hello, world!'
});

console.log(text);
```

## ✅ What the Provider Handles for You

- ✅ **OAuth2 Client Credentials Flow** - Automatic token management
- ✅ **API Authentication** - All headers and auth handled  
- ✅ **Request/Response Formatting** - SAP AI Core ↔ Vercel AI SDK
- ✅ **Error Handling** - Detailed error messages and logging
- ✅ **Streaming Support** - Real-time responses with SSE
- ✅ **Function Calling** - Tool execution capabilities
- ✅ **Multi-modal Support** - Text + image inputs

## 🛠️ Configuration Options

### Basic Usage
```typescript
const provider = await createSAPAIProvider({
  serviceKey: 'your-service-key-json',
  deploymentId: 'your-deployment-id'
});
```

### Advanced Configuration
```typescript
const provider = await createSAPAIProvider({
  serviceKey: 'your-service-key-json',
  deploymentId: 'your-deployment-id',
  resourceGroup: 'custom-group',           // default: 'default'
  baseURL: 'https://custom.ai.api.com',    // custom API endpoint
});
```

### Model Settings
```typescript
const model = provider('gpt-4o', {
  modelParams: {
    temperature: 0.7,        // Creativity (0-1)
    maxTokens: 1000,         // Response length  
    topP: 0.9,              // Nucleus sampling
  },
  safePrompt: true,         // Content filtering
  structuredOutputs: true   // JSON output support
});
```

## 🎮 Available Models

```typescript
// OpenAI Models (most common)
'gpt-4o' | 'gpt-4o-mini' | 'gpt-4' | 'o1' | 'o1-mini'

// Google Models  
'gemini-1.5-pro' | 'gemini-1.5-flash' | 'gemini-2.0-flash'

// Amazon Models
'amazon--nova-premier' | 'amazon--nova-pro' | 'amazon--nova-lite'

// Anthropic Models  
'claude-3-5-sonnet' | 'claude-3-5-haiku' | 'claude-3-opus'
```

## 🔀 Alternative Approaches

### For Development/Testing Only
```typescript
import { sapai } from './sap-ai';

// Set environment variable: SAP_AI_TOKEN=your_token
const { text } = await generateText({
  model: sapai('gpt-4o'),
  prompt: 'Hello!'
});
```

### For Advanced Users with Pre-obtained Token
```typescript
const provider = await createSAPAIProvider({
  token: 'your-oauth-token',
  deploymentId: 'your-deployment-id'
});
```

## 🌟 Real-World Examples

### Streaming Chat
```typescript
import { streamText } from 'ai';

const { textStream } = await streamText({
  model: provider('gpt-4o'),
  prompt: 'Tell me a story about AI and humans working together.'
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}
```

### Function Calling
```typescript
import { generateText, tool } from 'ai';
import { z } from 'zod';

const { text } = await generateText({
  model: provider('gpt-4o'),
  prompt: 'What is 25 × 17?',
  tools: {
    calculate: tool({
      description: 'Perform mathematical calculations',
      parameters: z.object({
        expression: z.string().describe('Math expression to evaluate')
      }),
      execute: async ({ expression }) => {
        // Your calculation logic
        return eval(expression); // Don't use eval in production!
      }
    })
  }
});
```

### Next.js API Route
```typescript
// pages/api/chat.ts
import { createSAPAIProvider } from '@/lib/sap-ai';
import { streamText } from 'ai';

const provider = await createSAPAIProvider({
  serviceKey: process.env.SAP_AI_SERVICE_KEY!,
  deploymentId: process.env.SAP_AI_DEPLOYMENT_ID!
});

export default async function handler(req, res) {
  const { messages } = req.body;
  
  const result = await streamText({
    model: provider('gpt-4o'),
    messages
  });
  
  return result.toDataStreamResponse();
}
```

## 🎯 Bottom Line

**Use `createSAPAIProvider()` with your service key** - it's the easiest and most reliable approach:

1. ✅ **No OAuth complexity** - handled automatically
2. ✅ **No token management** - refresh handled for you  
3. ✅ **No authentication headaches** - just works
4. ✅ **Production ready** - secure and robust

Just copy your service key from SAP BTP and you're ready to build AI applications! 🚀

## 🆘 Need Help?

**Common issues:**
- **"Failed to get OAuth access token"** → Check your service key is valid JSON
- **"Model name must be one of..."** → Use supported models (see list above)
- **"Missing Tenant Id"** → Ensure proper SAP AI Core service instance setup

**Still stuck?** Check the full README.md for detailed troubleshooting and examples. 