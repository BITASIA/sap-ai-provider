import { generateText } from 'ai';
import { createSAPAIProvider } from '../src/index';
import 'dotenv/config';

(async () => {
  console.log('🖼️  SAP AI Core Image Recognition Example\n');

  // Create provider using SAP_AI_SERVICE_KEY environment variable
  // Make sure to set SAP_AI_SERVICE_KEY in your .env file
  const serviceKey = process.env.SAP_AI_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error('SAP_AI_SERVICE_KEY environment variable is required. Please set it in your .env file.');
  }

  // This is all the user needs to do!
  // Make sure to set SAP_AI_SERVICE_KEY in your .env file
  const provider = await createSAPAIProvider({
    serviceKey: serviceKey
  });

  // Example 1: Using a public URL
  console.log('📸 Example 1: Public URL Image');
  console.log('==============================');
  
  const { text: urlResponse } = await generateText({
    model: provider('gpt-4o'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What do you see in this image?'
          },
          {
            type: 'image',
            image: new URL('https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png')
          }
        ]
      }
    ]
  });
  
  console.log('🤖 Response:', urlResponse);
  console.log('');

  // Example 2: Using base64 encoded image
  console.log('📸 Example 2: Base64 Encoded Image');
  console.log('==================================');
  
  // Small 1x1 pixel red PNG for demo
  const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  
  const { text: base64Response } = await generateText({
    model: provider('gpt-4o'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Describe this image in detail.'
          },
          {
            type: 'image',
            image: `data:image/png;base64,${base64Image}`,
          }
        ]
      }
    ]
  });
  
  console.log('🤖 Response:', base64Response);
  console.log('');

  // Example 3: Multiple images analysis
  console.log('📸 Example 3: Multiple Images Analysis');
  console.log('=====================================');
  
  const { text: multiResponse } = await generateText({
    model: provider('gpt-4o'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Compare these two images and tell me what you notice:'
          },
          {
            type: 'image',
            image: new URL('https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png')
          },
          {
            type: 'image',
            image: `data:image/png;base64,${base64Image}`,
          }
        ]
      }
    ]
  });
  
  console.log('🤖 Response:', multiResponse);
  console.log('');

  console.log('✅ All examples completed successfully!');
})(); 