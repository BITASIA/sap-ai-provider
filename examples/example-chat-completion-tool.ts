#!/usr/bin/env node

/**
 * Chat Completion Test for SAP AI Core Provider
 * 
 * This script tests actual chat completion and tool calling using your SAP AI Core service.
 * It uses the AICORE_SERVICE_KEY environment variable for authentication.
 * 
 * Setup:
 * 1. Install AI SDK: npm install ai
 * 2. Set AICORE_SERVICE_KEY in your .env file
 * 3. Run: npx tsx example-chat-completion-tool.ts
 */

import { createSAPAIProvider } from '../src/index';

// Create custom fetch with detailed logging
function createDebugFetch() {
  return async (url: URL | RequestInfo, options?: RequestInit) => {
    console.log('🌐 API Request Details:');
    console.log('  URL:', url);
    console.log('  Method:', options?.method || 'GET');
    console.log('  Headers:', JSON.stringify(options?.headers || {}, null, 2));
    
    // Handle different body types
    let bodyPreview = '[No body]';
    if (options?.body) {
      if (typeof options.body === 'string') {
        bodyPreview = options.body.substring(0, 500);
      } else {
        bodyPreview = '[Non-string body]';
      }
    }
    console.log('  Body (first 500 chars):', bodyPreview);
    console.log('');

    const response = await fetch(url, options);
    
    console.log('📡 API Response Details:');
    console.log('  Status:', response.status);
    console.log('  Status Text:', response.statusText);
    console.log('  Headers:', Object.fromEntries(response.headers.entries()));
    
    // Clone response to read body without consuming it
    const clonedResponse = response.clone();
    try {
      const responseText = await clonedResponse.text();
      console.log('  Body (first 1000 chars):', responseText.substring(0, 1000));
      if (responseText.length > 1000) {
        console.log('  ... (truncated)');
      }
    } catch (e) {
      console.log('  Body: [Could not read response body]');
    }
    console.log('');

    return response;
  };
}


// Mock generateText function (for testing without AI SDK)
async function mockGenerateText({ model, prompt, messages, tools }: any) {
  console.log('🔄 Testing chat completion with SAP AI Core...');
  
  // Build the prompt for the API
  const finalPrompt = messages || [{ 
    role: 'user', 
    content: [{ type: 'text', text: prompt }] 
  }];

  try {
    // Call the model's internal doGenerate method
    const result = await model.doGenerate({
      prompt: finalPrompt,
      headers: {},
      mode: { type: 'regular' },
      inputFormat: 'messages',
      tools: tools || undefined
    });

    return {
      text: result.text,
      usage: result.usage,
      finishReason: result.finishReason,
      toolCalls: result.toolCalls || []
    };
  } catch (error: any) {
    console.error('❌ API Error Details:');
    console.error('  Message:', error.message);
    console.error('  Name:', error.name);
    console.error('  Stack:', error.stack);
    
    if (error.response) {
      console.error('  Response Status:', error.response.status);
      try {
        const responseText = await error.response.text();
        console.error('  Response Body:', responseText);
      } catch (e) {
        console.error('  Response Body: [Could not read]');
      }
    }
    
    if (error.data) {
      console.error('  Error Data:', JSON.stringify(error.data, null, 2));
    }
    
    throw error;
  }
}

async function testChatCompletion() {
  console.log('🧪 SAP AI Core Chat Completion Test\n');

  try {
    // Create provider using AICORE_SERVICE_KEY environment variable
    console.log('📝 Creating SAP AI provider with environment variable...');
    console.log('🔑 Using AICORE_SERVICE_KEY for authentication (OAuth handled automatically)');
    
    const debugFetch = createDebugFetch();
    
    const sapai = await createSAPAIProvider({
      deploymentId: process.env.SAP_AI_DEPLOYMENT_ID || 'd65d81e7c077e583',
      resourceGroup: process.env.SAP_AI_RESOURCE_GROUP || 'default',
      fetch: debugFetch
    });

    console.log('✅ Provider created successfully');
    console.log(`📋 Configuration:`);
    console.log(`   - Authentication: AICORE_SERVICE_KEY environment variable`);
    console.log(`   - Deployment ID: ${process.env.SAP_AI_DEPLOYMENT_ID || 'd65d81e7c077e583'}`);
    console.log(`   - Resource Group: ${process.env.SAP_AI_RESOURCE_GROUP || 'default'}`);
    console.log('');

    // Step 3: Test simple chat completion
    console.log('💬 Test 1: Simple Question');
    const model = sapai('gpt-4o', {
      modelParams: {
        temperature: 0.7,
        maxTokens: 200
      }
    });

    const result1 = await mockGenerateText({
      model,
      prompt: 'What is 2 + 2? Please explain briefly.'
    });

    console.log('✅ Success!');
    console.log('📄 Response:');
    console.log('   ', result1.text);
    console.log('📊 Usage:', result1.usage);
    console.log('🏁 Finish reason:', result1.finishReason);
    console.log('');

    // Step 4: Test tool calling (arithmetic function)
    console.log('💬 Test 2: Tool Calling (Arithmetic Function)');
    const modelWithTools = sapai('gpt-4o', {
      modelParams: {
        maxTokens: 200
      },
      tools: [
        {
          type: 'function',
          function: {
            name: 'calculate_sum',
            description: 'Calculate the sum of two integers.',
            parameters: {
              type: 'object',
              properties: {
                a: { type: 'integer', description: 'First number' },
                b: { type: 'integer', description: 'Second number' }
              },
              required: ['a', 'b'],
              additionalProperties: false
            }
          }
        }
      ]
    });

    console.log('🔧 Testing tool calling with calculate_sum function...');
    
    const result2 = await mockGenerateText({
      model: modelWithTools,
      prompt: 'What is the sum of 7 and 5?'
    });

    console.log('✅ Tool calling test completed!');
    if (result2.text) {
      console.log('📄 Response:');
      console.log('   ', result2.text);
    } else {
      console.log('📄 Response: (Model wants to call tools - no text response)');
    }
    console.log('📊 Usage:', result2.usage);
    console.log('🏁 Finish reason:', result2.finishReason);
    
    if (result2.toolCalls && result2.toolCalls.length > 0) {
      console.log('🛠️ Tool calls detected:');
      result2.toolCalls.forEach((toolCall: any, index: number) => {
        try {
          const args = JSON.parse(toolCall.args);
          const formattedArgs = Object.entries(args)
            .map(([key, value]) => `${key}=${value}`)
            .join(', ');
          console.log(`   ${index + 1}. ${toolCall.toolName}(${formattedArgs})`);
        } catch {
          console.log(`   ${index + 1}. ${toolCall.toolName}(${toolCall.args})`);
        }
      });
    } else {
      console.log('ℹ️  No tool calls were made in this test');
    }
    console.log('');

    // Step 5: Simulate tool execution and send result back
    if (result2.toolCalls && result2.toolCalls.length > 0) {
      const toolCall = result2.toolCalls[0];
      const args = JSON.parse(toolCall.args);

      // 1. Execute the tool locally
      function calculate_sum({ a, b }: { a: number, b: number }) {
        return a + b;
      }
      const toolResult = calculate_sum(args);

      // 2. Build the follow-up messages for final response
      const followUpMessages = [
        { 
          role: 'user', 
          content: [{ 
            type: 'text', 
            text: `I asked you to calculate the sum of 7 and 5. You called the calculate_sum function with arguments {"a":7,"b":5} and got the result ${toolResult}. Please provide a complete answer to my original question.`
          }] 
        }
      ];

      // 3. Get the final model response
      const result3 = await mockGenerateText({
        model: modelWithTools,
        messages: followUpMessages
      });

      console.log('✅ Final response after tool execution:');
      console.log('📄 Response:');
      console.log('   ', result3.text);
      console.log('📊 Usage:', result3.usage);
      console.log('🏁 Finish reason:', result3.finishReason);
    }

    console.log('🎉 All chat completion and tool calling tests passed!');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    
    // Provide specific troubleshooting based on error type
    if (error.message.includes('401')) {
      console.error('💡 Troubleshooting: Authentication failed');
      console.error('   - Check your client ID and secret');
      console.error('   - Verify the identity zone URL');
      console.error('   - Ensure the access token is valid');
    } else if (error.message.includes('404')) {
      console.error('💡 Troubleshooting: Deployment not found');
      console.error('   - Check your deployment ID');
      console.error('   - Verify deployment is active in SAP AI Core');
      console.error('   - Check the API endpoint URL');
    } else if (error.message.includes('403')) {
      console.error('💡 Troubleshooting: Access denied');
      console.error('   - Check resource group permissions');
      console.error('   - Verify deployment access');
    } else if (error.message.includes('400')) {
      console.error('💡 Troubleshooting: Bad request');
      console.error('   - Check the request payload format');
      console.error('   - Verify model parameters');
    } else {
      console.error('💡 Troubleshooting: General error');
      console.error('   - Check network connectivity');
      console.error('   - Verify SAP AI Core service is available');
      console.error('   - Review the API request/response logs above');
    }
    
    process.exit(1);
  }
}

if (require.main === module) {
  testChatCompletion().catch(console.error);
}

export { getAccessToken, testChatCompletion };

