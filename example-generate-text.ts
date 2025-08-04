import { generateText } from 'ai';
import { createSAPAIProvider } from './src/index';

(async () => {
  // Create provider using AICORE_SERVICE_KEY environment variable
  // Make sure to set AICORE_SERVICE_KEY in your .env file
  const provider = await createSAPAIProvider();

  // Generate text (following Vercel AI SDK pattern)
  const { text, usage, finishReason } = await generateText({
    model: provider('gpt-4o'),
    messages: [
      {
        role: 'user',
        content: 'How to make a delicious mashed potatoes?'
      }
    ]
  });

  // Clean output like the examples
  console.log('🤖 Response:', text);
  console.log('📊 Usage:', `${usage.promptTokens} prompt + ${usage.completionTokens} completion = ${usage.totalTokens} total tokens`);
  console.log('🏁 Finish reason:', finishReason);


  // Testing harmonizedAPI
  console.log('Testing harmonizedAPI');
  console.log('--------------------------------');
  const multipleAI = ['gpt-4o', 'gemini-2.0-flash', 'anthropic--claude-4-sonnet'];
  for (const model of multipleAI) {
    console.log('--------------------------------');
    console.log('Testing', model);
    const { text: text2, usage: usage2, finishReason: finishReason2 } = await generateText({
        model: provider(model),
        messages: [
        {
            role: 'user',
            content: 'How to make a delicious mashed potatoes?'
        }
        ]
    });
    console.log('🤖 Response:', text2);
    console.log('📊 Usage:', `${usage2.promptTokens} prompt + ${usage2.completionTokens} completion = ${usage2.totalTokens} total tokens`);
    console.log('🏁 Finish reason:', finishReason2);
  }

})();
