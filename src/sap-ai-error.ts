import { createJsonErrorResponseHandler } from '@ai-sdk/provider-utils';
import { z } from 'zod';

const sapAIErrorSchema = z.object({
  request_id: z.string().optional(),
  code: z.number().optional(),
  message: z.string().optional(),
  location: z.string().optional(),
  error: z.object({
    message: z.string().optional(),
    code: z.string().optional(),
    param: z.string().optional(),
    type: z.string().optional(),
  }).optional(),
  details: z.string().optional(),
}).optional();

export type SAPAIErrorData = z.infer<typeof sapAIErrorSchema>;

export class SAPAIError extends Error {
  public readonly code?: number;
  public readonly location?: string;
  public readonly requestId?: string;
  public readonly details?: string;

  constructor(
    message: string,
    public readonly data?: SAPAIErrorData,
    public readonly response?: Response
  ) {
    super(message);
    this.name = 'SAPAIError';
    
    if (data) {
      this.code = data.code;
      this.location = data.location;
      this.requestId = data.request_id;
      this.details = data.details;
    }
  }
}

export const sapAIFailedResponseHandler: any = createJsonErrorResponseHandler({
  errorSchema: sapAIErrorSchema as any, // ✅ Simple any casting
  errorToMessage: (data: SAPAIErrorData) => {
    return (
      data?.error?.message ||
      data?.message ||
      'An error occurred during the SAP AI Core request.'
    );
  },
  isRetryable: (response: Response, error?: unknown) => {
    const status = response.status;
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
  },
});