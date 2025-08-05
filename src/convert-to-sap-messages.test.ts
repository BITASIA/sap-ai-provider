import { describe, expect, it } from 'vitest';
import { convertToSAPMessages } from './convert-to-sap-messages';

// Helpers ------------------------------------------------------------------

/**
 * Shorthand factory for a text content part
 */
const textPart = (text: string) => ({ type: 'text' as const, text });

/**
 * Shorthand factory for a file/image content part (URL variant)
 */
const imageUrlPart = (url: string, mediaType = 'image/png') => ({
  type: 'file' as const,
  data: new URL(url),
  mediaType,
});

// --------------------------------------------------------------------------
//  Tests
// --------------------------------------------------------------------------

describe('convertToSAPMessages', () => {
  it('converts a simple system message', () => {
    const prompt = [
      { role: 'system', content: 'You are a helpful assistant.' },
    ] as any; // `any` keeps the test independent of external type defs

    const result = convertToSAPMessages(prompt);

    expect(result).toStrictEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
    ]);
  });

  it('converts a user text-only message into a plain string', () => {
    const prompt = [
      {
        role: 'user',
        content: [textPart('Hello, world!')],
      },
    ] as any;

    const result = convertToSAPMessages(prompt);

    expect(result).toStrictEqual([
      { role: 'user', content: 'Hello, world!' },
    ]);
  });

  it('converts a user image message (URL variant) into SAP structured format', () => {
    const url = 'https://example.com/cat.png';
    const prompt = [
      {
        role: 'user',
        content: [imageUrlPart(url)],
      },
    ] as any;

    const result = convertToSAPMessages(prompt);

    expect(result).toStrictEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url },
          },
        ],
      },
    ]);
  });

  it('converts an assistant message with text and a tool call', () => {
    const prompt = [
      {
        role: 'assistant',
        content: [
          textPart('Sure, here you go.'),
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'get_weather',
            input: { location: 'Berlin' },
          },
        ],
      },
    ] as any;

    const result = convertToSAPMessages(prompt);

    expect(result).toStrictEqual([
      {
        role: 'assistant',
        content: 'Sure, here you go.',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: JSON.stringify({ location: 'Berlin' }),
            },
          },
        ],
      },
    ]);
  });

  it('converts a tool message containing a tool-result', () => {
    const prompt = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            output: { temp: 22, unit: 'C' },
          },
        ],
      },
    ] as any;

    const result = convertToSAPMessages(prompt);

    expect(result).toStrictEqual([
      {
        role: 'tool',
        tool_call_id: 'call_1',
        content: JSON.stringify({ temp: 22, unit: 'C' }),
      },
    ]);
  });
});
