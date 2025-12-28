import { AugmentConfig, OpenRouterRequest, AugmentResult } from './types';

export interface ForwardResult {
  success: boolean;
  response?: Response;
  error?: string;
  errorCode?: number;
}

export class OpenRouterForwarder {
  private config: AugmentConfig;
  private logger: any;

  constructor(config: AugmentConfig, logger?: any) {
    this.config = config;
    this.logger = logger || console;
  }

  async forward(
    augmentedBody: OpenRouterRequest,
    isStreaming: boolean
  ): Promise<ForwardResult> {
    const endpoint = this.config.openrouter_endpoint;
    const authToken = this.config.openrouter_auth;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      'HTTP-Referer': 'https://claude-code-augment.local',
      'X-Title': 'Claude Code Augment',
    };

    try {
      this.logRequest(augmentedBody);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(augmentedBody),
      });

      if (!response.ok) {
        const errorBody = await this.safeReadError(response);
        return {
          success: false,
          error: errorBody.message || `OpenRouter error: ${response.status}`,
          errorCode: response.status,
        };
      }

      return {
        success: true,
        response,
      };
    } catch (error: any) {
      this.logger.error?.('OpenRouter forward failed:', error.message);

      if (
        error.code === 'ECONNREFUSED' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ETIMEDOUT' ||
        error.name === 'TypeError'
      ) {
        return {
          success: false,
          error: `Network error: Unable to reach OpenRouter endpoint - ${error.message}`,
          errorCode: 502,
        };
      }

      return {
        success: false,
        error: `Forward error: ${error.message}`,
        errorCode: 500,
      };
    }
  }

  async handleStreamingResponse(
    response: Response
  ): Promise<ReadableStream<Uint8Array>> {
    if (!response.body) {
      throw new Error('Response body is null');
    }

    return this.transformOpenRouterToAnthropic(response.body);
  }

  async handleNonStreamingResponse(response: Response): Promise<any> {
    const data = await response.json();
    return this.convertOpenRouterResponseToAnthropic(data);
  }

  private transformOpenRouterToAnthropic(
    stream: ReadableStream<Uint8Array>
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const mapFinishReason = this.mapFinishReason.bind(this);

    let buffer = '';
    let messageId = `msg_${Date.now()}`;
    let inputTokens = 0;
    let outputTokens = 0;
    let sentStart = false;

    return new ReadableStream({
      async start(controller) {
        const reader = stream.getReader();

        const sendEvent = (event: string, data: any) => {
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') continue;

              try {
                const chunk = JSON.parse(jsonStr);

                if (!sentStart) {
                  sendEvent('message_start', {
                    type: 'message_start',
                    message: {
                      id: messageId,
                      type: 'message',
                      role: 'assistant',
                      content: [],
                      model: chunk.model || 'unknown',
                      stop_reason: null,
                      stop_sequence: null,
                      usage: { input_tokens: 0, output_tokens: 0 },
                    },
                  });
                  sendEvent('content_block_start', {
                    type: 'content_block_start',
                    index: 0,
                    content_block: { type: 'text', text: '' },
                  });
                  sentStart = true;
                }

                const delta = chunk.choices?.[0]?.delta;
                if (delta?.content) {
                  sendEvent('content_block_delta', {
                    type: 'content_block_delta',
                    index: 0,
                    delta: { type: 'text_delta', text: delta.content },
                  });
                }

                if (chunk.usage) {
                  inputTokens = chunk.usage.prompt_tokens || inputTokens;
                  outputTokens = chunk.usage.completion_tokens || outputTokens;
                }

                if (chunk.choices?.[0]?.finish_reason) {
                  sendEvent('content_block_stop', {
                    type: 'content_block_stop',
                    index: 0,
                  });
                  sendEvent('message_delta', {
                    type: 'message_delta',
                    delta: {
                      stop_reason: mapFinishReason(
                        chunk.choices[0].finish_reason
                      ),
                      stop_sequence: null,
                    },
                    usage: { output_tokens: outputTokens },
                  });
                  sendEvent('message_stop', { type: 'message_stop' });
                }
              } catch (parseError) {
                // Skip malformed chunks
              }
            }
          }
        } catch (error) {
          controller.error(error);
        } finally {
          controller.close();
        }
      },
    });
  }

  private convertOpenRouterResponseToAnthropic(data: any): any {
    const choice = data.choices?.[0];
    const message = choice?.message;

    return {
      id: data.id || `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: message?.content || '',
        },
      ],
      model: data.model || 'unknown',
      stop_reason: this.mapFinishReason(choice?.finish_reason),
      stop_sequence: null,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
      },
    };
  }

  private mapFinishReason(reason: string): string {
    const mapping: Record<string, string> = {
      stop: 'end_turn',
      length: 'max_tokens',
      tool_calls: 'tool_use',
      content_filter: 'stop_sequence',
      function_call: 'tool_use',
    };
    return mapping[reason] || 'end_turn';
  }

  private async safeReadError(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      return { message: `HTTP ${response.status}: ${response.statusText}` };
    }
  }

  private logRequest(body: OpenRouterRequest): void {
    this.logger.debug?.({
      msg: 'Forwarding augmented request to OpenRouter',
      model: body.model,
      messageCount: body.messages?.length,
      hasTools: !!body.tools?.length,
      stream: body.stream,
    });
  }
}

export const createForwarder = (
  config: AugmentConfig,
  logger?: any
): OpenRouterForwarder => {
  return new OpenRouterForwarder(config, logger);
};
