import {
  AugmentConfig,
  AugmentRequest,
  AugmentResult,
  SystemPrompt,
  MessageParam,
  OpenRouterRequest,
  OpenRouterMessage,
} from './types';

export class RequestAugmenter {
  private config: AugmentConfig;

  constructor(config: AugmentConfig) {
    this.config = config;
  }

  validateConfig(): AugmentResult {
    if (!this.config.openrouter_endpoint) {
      return {
        success: false,
        augmented: false,
        error: 'Missing required parameter: openrouter_endpoint',
        errorCode: 400,
      };
    }

    if (!this.config.openrouter_auth) {
      return {
        success: false,
        augmented: false,
        error: 'Missing required parameter: openrouter_auth',
        errorCode: 400,
      };
    }

    if (
      this.config.additional_instructions &&
      !Array.isArray(this.config.additional_instructions)
    ) {
      return {
        success: false,
        augmented: false,
        error: 'Invalid parameter: additional_instructions must be an array',
        errorCode: 400,
      };
    }

    if (
      this.config.extra_context &&
      typeof this.config.extra_context !== 'object'
    ) {
      return {
        success: false,
        augmented: false,
        error: 'Invalid parameter: extra_context must be an object',
        errorCode: 400,
      };
    }

    return { success: true, augmented: false };
  }

  augmentRequest(req: AugmentRequest): {
    augmentedBody: OpenRouterRequest;
    result: AugmentResult;
  } {
    const validation = this.validateConfig();
    if (!validation.success) {
      return {
        augmentedBody: {} as OpenRouterRequest,
        result: validation,
      };
    }

    const originalBody = req.body;
    const augmentedMessages: OpenRouterMessage[] = [];

    const systemPrompt = this.buildSystemPrompt(originalBody.system);
    if (systemPrompt) {
      augmentedMessages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    if (
      this.config.additional_instructions &&
      this.config.additional_instructions.length > 0
    ) {
      for (const instruction of this.config.additional_instructions) {
        augmentedMessages.push({
          role: 'system',
          content: instruction,
        });
      }
    }

    if (this.config.extra_context) {
      augmentedMessages.push({
        role: 'system',
        content: `<context>\n${JSON.stringify(this.config.extra_context, null, 2)}\n</context>`,
      });
    }

    const convertedMessages = this.convertMessages(originalBody.messages);
    augmentedMessages.push(...convertedMessages);

    const augmentedBody: OpenRouterRequest = {
      model: originalBody.model,
      messages: augmentedMessages,
      max_tokens: originalBody.max_tokens,
      stream: originalBody.stream,
    };

    if (originalBody.tools && originalBody.tools.length > 0) {
      augmentedBody.tools = this.convertTools(originalBody.tools);
    }

    const additionalFields = [
      'temperature',
      'top_p',
      'top_k',
      'frequency_penalty',
      'presence_penalty',
      'stop',
    ];
    for (const field of additionalFields) {
      if (originalBody[field] !== undefined) {
        augmentedBody[field] = originalBody[field];
      }
    }

    return {
      augmentedBody,
      result: { success: true, augmented: true },
    };
  }

  private buildSystemPrompt(
    originalSystem?: SystemPrompt[]
  ): string {
    const parts: string[] = [];

    if (this.config.modified_system_prompt) {
      parts.push(this.config.modified_system_prompt);
    }

    if (originalSystem && Array.isArray(originalSystem)) {
      for (const item of originalSystem) {
        if (item.type === 'text' && item.text) {
          if (!this.config.modified_system_prompt) {
            parts.push(item.text);
          }
        }
      }
    }

    return parts.join('\n\n');
  }

  private convertMessages(messages: MessageParam[]): OpenRouterMessage[] {
    const converted: OpenRouterMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        continue;
      }

      const convertedMsg: OpenRouterMessage = {
        role: msg.role as 'user' | 'assistant',
        content: this.convertContent(msg.content),
      };

      converted.push(convertedMsg);
    }

    return converted;
  }

  private convertContent(
    content: string | any[]
  ): string | any[] {
    if (typeof content === 'string') {
      return content;
    }

    if (!Array.isArray(content)) {
      return String(content);
    }

    const converted: any[] = [];

    for (const block of content) {
      if (block.type === 'text') {
        converted.push({
          type: 'text',
          text: block.text,
        });
      } else if (block.type === 'image') {
        if (block.source?.type === 'base64') {
          converted.push({
            type: 'image_url',
            image_url: {
              url: `data:${block.source.media_type};base64,${block.source.data}`,
            },
          });
        } else if (block.source?.type === 'url') {
          converted.push({
            type: 'image_url',
            image_url: {
              url: block.source.url,
            },
          });
        }
      } else if (block.type === 'tool_use') {
        converted.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: block.input,
        });
      } else if (block.type === 'tool_result') {
        converted.push({
          type: 'tool_result',
          tool_use_id: block.tool_use_id,
          content: block.content,
        });
      } else {
        converted.push(block);
      }
    }

    return converted.length === 1 && converted[0].type === 'text'
      ? converted[0].text
      : converted;
  }

  private convertTools(tools: any[]): any[] {
    return tools.map((tool) => {
      if (tool.type === 'function') {
        return tool;
      }

      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.input_schema,
        },
      };
    });
  }
}

export const createAugmenter = (config: AugmentConfig): RequestAugmenter => {
  return new RequestAugmenter(config);
};
