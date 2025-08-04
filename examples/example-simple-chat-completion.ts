#!/usr/bin/env node

/**
 * SAP AI Provider Pattern Examples
 * 
 * This example demonstrates the different ways to use the SAP AI provider
 * following Vercel AI SDK patterns.
 */

// Approach 1: Original createSAPAI function (still supported)

// Approach 2: New Vercel AI SDK pattern (async version)
import { createSAPAIProvider } from '../src/sap-ai-provider';


async function simpleTest() {
  console.log('🧪 Simple SAP AI Test with Environment Variable (User-Friendly)\n');

  try {
    console.log('🔄 Creating provider using AICORE_SERVICE_KEY environment variable...');
    
    // This is all the user needs to do!
    // Make sure to set AICORE_SERVICE_KEY in your .env file
    const provider = await createSAPAIProvider();

    console.log('📝 Testing text generation...');
    const model = provider('gpt-4o', {
      modelParams: { temperature: 0.7 },
      safePrompt: true,
      structuredOutputs: true,
    });


    const result = await model.doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'How to cook a delicious chicken recipe?' }] }],
      mode: { type: 'regular' },
      inputFormat: 'messages',
    });

    console.log('✅ Success!');
    console.log('📄 Generated text:', result.text);
    console.log('📊 Usage:', `${result.usage.promptTokens} prompt + ${result.usage.completionTokens} completion tokens`);
    console.log('🏁 Finish reason:', result.finishReason);
    console.log('');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    
    if (error.message.includes('Failed to get OAuth access token')) {
      console.error('💡 Troubleshooting: OAuth authentication failed');
      console.error('   - Check if your service key is valid');
      console.error('   - Ensure the service key has the correct permissions');
    } else if (error.message.includes('Invalid service key JSON format')) {
      console.error('💡 Troubleshooting: Invalid service key format');
      console.error('   - Make sure the service key is valid JSON');
      console.error('   - Copy the exact service key from SAP BTP');
    } else {
      console.error('💡 General error - check the details above');
    }
  }
}

if (require.main === module) {
  simpleTest().catch(console.error);
}

export { simpleTest };
