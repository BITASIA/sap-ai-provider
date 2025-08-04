import { generateText } from 'ai';
import { createSAPAIProvider } from './src/index';

const AICORE_SERVICE_KEY = process.env.AICORE_SERVICE_KEY || '{"serviceurls":{"AI_API_URL":"https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com"},"appname":"d037951a-d81f-405d-a3c8-b6b55ec3ecb5!b499687|aicore!b540","clientid":"sb-d037951a-d81f-405d-a3c8-b6b55ec3ecb5!b499687|aicore!b540","clientsecret":"1dcf6f55-faab-4dcb-8254-1a4448a0cc63$w8PqXEAf0CrAlGBK4H6xRSTZcWP7RBD6lKgJatsUmkE=","identityzone":"provider-dev-5dbg7fzn","identityzoneid":"2a6e99f2-5dbf-4b82-809e-e53b510f8a88","url":"https://provider-dev-5dbg7fzn.authentication.eu10.hana.ondemand.com","credential-type":"binding-secret"}';

// Sample base64 image (small 1x1 pixel red PNG for testing)
const SAMPLE_BASE64_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

// Sample public image URL (you can replace with your own)
const SAMPLE_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png';

async function testImageRecognition() {
  console.log('🖼️  SAP AI Core Image Recognition Test\n');

  try {
    // Create SAP AI provider
    const provider = await createSAPAIProvider({
      serviceKey: AICORE_SERVICE_KEY,
      deploymentId: process.env.SAP_AI_DEPLOYMENT_ID || 'd65d81e7c077e583'
    });

    console.log('✅ SAP AI provider created successfully\n');

    // Test 1: Base64 Image Recognition
    console.log('📋 Test 1: Base64 Image Recognition');
    console.log('================================');
    
    try {
      const { text: base64Result, usage: base64Usage } = await generateText({
        model: provider('gpt-4o'),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What do you see in this image? Describe it in detail.'
              },
              {
                type: 'image',
                image: `data:image/png;base64,${SAMPLE_BASE64_IMAGE}`,
                mimeType: 'image/png'
              }
            ]
          }
        ]
      });

      console.log('🤖 Base64 Image Response:', base64Result);
      console.log('📊 Usage:', `${base64Usage.promptTokens} prompt + ${base64Usage.completionTokens} completion = ${base64Usage.totalTokens} total tokens`);
      console.log('✅ Base64 image test passed!\n');
    } catch (error) {
      console.error('❌ Base64 image test failed:', error);
      console.log('');
    }

    // Test 2: Public URL Image Recognition
    console.log('📋 Test 2: Public URL Image Recognition');
    console.log('=====================================');
    
    try {
      const { text: urlResult, usage: urlUsage } = await generateText({
        model: provider('gpt-4o'),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'What is shown in this image? Please describe what you can see.'
              },
              {
                type: 'image',
                image: new URL(SAMPLE_IMAGE_URL)
              }
            ]
          }
        ]
      });

      console.log('🤖 URL Image Response:', urlResult);
      console.log('📊 Usage:', `${urlUsage.promptTokens} prompt + ${urlUsage.completionTokens} completion = ${urlUsage.totalTokens} total tokens`);
      console.log('✅ URL image test passed!\n');
    } catch (error) {
      console.error('❌ URL image test failed:', error);
      console.log('');
    }

    // Test 3: Multiple Images Recognition
    console.log('📋 Test 3: Multiple Images Recognition');
    console.log('====================================');
    
    try {
      const { text: multiResult, usage: multiUsage } = await generateText({
        model: provider('gpt-4o'),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'I am showing you two images. Please describe what you see in each image and compare them.'
              },
              {
                type: 'image',
                image: `data:image/png;base64,${SAMPLE_BASE64_IMAGE}`,
                mimeType: 'image/png'
              },
              {
                type: 'image',
                image: new URL(SAMPLE_IMAGE_URL)
              }
            ]
          }
        ]
      });

      console.log('🤖 Multiple Images Response:', multiResult);
      console.log('📊 Usage:', `${multiUsage.promptTokens} prompt + ${multiUsage.completionTokens} completion = ${multiUsage.totalTokens} total tokens`);
      console.log('✅ Multiple images test passed!\n');
    } catch (error) {
      console.error('❌ Multiple images test failed:', error);
      console.log('');
    }

    // Test 4: Text + Image with Context
    console.log('📋 Test 4: Text + Image with Context');
    console.log('===================================');
    
    try {
      const { text: contextResult, usage: contextUsage } = await generateText({
        model: provider('gpt-4o'),
        messages: [
          {
            role: 'system',
            content: 'You are an expert image analyst. Provide detailed and accurate descriptions of images.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'As an image analyst, please examine this image and provide:\n1. A technical description\n2. Color analysis\n3. Any notable features\n4. Estimated dimensions or format'
              },
              {
                type: 'image',
                image: new URL(SAMPLE_IMAGE_URL)
              }
            ]
          }
        ]
      });

      console.log('🤖 Context Analysis Response:', contextResult);
      console.log('📊 Usage:', `${contextUsage.promptTokens} prompt + ${contextUsage.completionTokens} completion = ${contextUsage.totalTokens} total tokens`);
      console.log('✅ Context analysis test passed!\n');
    } catch (error) {
      console.error('❌ Context analysis test failed:', error);
      console.log('');
    }

    console.log('🎉 All SAP AI Core image recognition tests completed!');

  } catch (error) {
    console.error('❌ Failed to create SAP AI provider:', error);
  }
}

// Run the test
testImageRecognition().catch(console.error); 