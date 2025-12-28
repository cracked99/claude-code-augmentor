import { RequestAugmenter, createAugmenter } from '../augmenter';
import { AugmentConfig, AugmentRequest } from '../types';

describe('RequestAugmenter', () => {
  const baseConfig: AugmentConfig = {
    enabled: true,
    openrouter_endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    openrouter_auth: 'test-auth',
    detection: {},
  };

  const createRequest = (overrides: Partial<AugmentRequest['body']> = {}): AugmentRequest => ({
    body: {
      model: 'claude-3-sonnet',
      messages: [
        { role: 'user', content: 'Hello, how are you?' },
      ],
      system: [
        { type: 'text', text: 'You are a helpful assistant.' },
      ],
      max_tokens: 1024,
      stream: true,
      ...overrides,
    },
    headers: {},
  });

  describe('validateConfig', () => {
    it('should pass validation with valid config', () => {
      const augmenter = createAugmenter(baseConfig);
      const result = augmenter.validateConfig();

      expect(result.success).toBe(true);
    });

    it('should fail validation without openrouter_endpoint', () => {
      const config = { ...baseConfig, openrouter_endpoint: '' };
      const augmenter = createAugmenter(config);
      const result = augmenter.validateConfig();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(400);
      expect(result.error).toContain('openrouter_endpoint');
    });

    it('should fail validation without openrouter_auth', () => {
      const config = { ...baseConfig, openrouter_auth: '' };
      const augmenter = createAugmenter(config);
      const result = augmenter.validateConfig();

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(400);
      expect(result.error).toContain('openrouter_auth');
    });

    it('should fail validation with invalid additional_instructions type', () => {
      const config = {
        ...baseConfig,
        additional_instructions: 'not an array' as any,
      };
      const augmenter = createAugmenter(config);
      const result = augmenter.validateConfig();

      expect(result.success).toBe(false);
      expect(result.error).toContain('additional_instructions');
    });

    it('should fail validation with invalid extra_context type', () => {
      const config = {
        ...baseConfig,
        extra_context: 'not an object' as any,
      };
      const augmenter = createAugmenter(config);
      const result = augmenter.validateConfig();

      expect(result.success).toBe(false);
      expect(result.error).toContain('extra_context');
    });
  });

  describe('augmentRequest', () => {
    it('should replace system prompt with modified_system_prompt', () => {
      const config: AugmentConfig = {
        ...baseConfig,
        modified_system_prompt: 'You are an augmented assistant.',
      };
      const augmenter = createAugmenter(config);
      const req = createRequest();

      const { augmentedBody, result } = augmenter.augmentRequest(req);

      expect(result.success).toBe(true);
      expect(result.augmented).toBe(true);
      expect(augmentedBody.messages[0].role).toBe('system');
      expect(augmentedBody.messages[0].content).toBe('You are an augmented assistant.');
    });

    it('should preserve original system prompt when no modified_system_prompt', () => {
      const augmenter = createAugmenter(baseConfig);
      const req = createRequest();

      const { augmentedBody } = augmenter.augmentRequest(req);

      expect(augmentedBody.messages[0].role).toBe('system');
      expect(augmentedBody.messages[0].content).toBe('You are a helpful assistant.');
    });

    it('should insert additional_instructions after system prompt', () => {
      const config: AugmentConfig = {
        ...baseConfig,
        additional_instructions: [
          'Always be concise.',
          'Use code examples when helpful.',
        ],
      };
      const augmenter = createAugmenter(config);
      const req = createRequest();

      const { augmentedBody } = augmenter.augmentRequest(req);

      expect(augmentedBody.messages[0].role).toBe('system');
      expect(augmentedBody.messages[1].role).toBe('system');
      expect(augmentedBody.messages[1].content).toBe('Always be concise.');
      expect(augmentedBody.messages[2].role).toBe('system');
      expect(augmentedBody.messages[2].content).toBe('Use code examples when helpful.');
    });

    it('should include extra_context as context message', () => {
      const config: AugmentConfig = {
        ...baseConfig,
        extra_context: {
          project: 'my-app',
          language: 'typescript',
        },
      };
      const augmenter = createAugmenter(config);
      const req = createRequest();

      const { augmentedBody } = augmenter.augmentRequest(req);

      const contextMessage = augmentedBody.messages.find(
        (m) => m.role === 'system' && (m.content as string).includes('<context>')
      );
      expect(contextMessage).toBeDefined();
      expect(contextMessage!.content).toContain('"project": "my-app"');
      expect(contextMessage!.content).toContain('"language": "typescript"');
    });

    it('should preserve user and assistant message order', () => {
      const augmenter = createAugmenter(baseConfig);
      const req = createRequest({
        messages: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
          { role: 'user', content: 'Second message' },
        ],
      });

      const { augmentedBody } = augmenter.augmentRequest(req);

      const nonSystemMessages = augmentedBody.messages.filter(
        (m) => m.role !== 'system'
      );
      expect(nonSystemMessages[0].role).toBe('user');
      expect(nonSystemMessages[0].content).toBe('First message');
      expect(nonSystemMessages[1].role).toBe('assistant');
      expect(nonSystemMessages[1].content).toBe('First response');
      expect(nonSystemMessages[2].role).toBe('user');
      expect(nonSystemMessages[2].content).toBe('Second message');
    });

    it('should convert Anthropic tools to OpenAI function format', () => {
      const augmenter = createAugmenter(baseConfig);
      const req = createRequest({
        tools: [
          {
            name: 'read_file',
            description: 'Read a file from disk',
            input_schema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
              },
              required: ['path'],
            },
          },
        ],
      });

      const { augmentedBody } = augmenter.augmentRequest(req);

      expect(augmentedBody.tools).toBeDefined();
      expect(augmentedBody.tools![0].type).toBe('function');
      expect(augmentedBody.tools![0].function.name).toBe('read_file');
      expect(augmentedBody.tools![0].function.description).toBe('Read a file from disk');
    });

    it('should preserve model and streaming settings', () => {
      const augmenter = createAugmenter(baseConfig);
      const req = createRequest({
        model: 'gpt-4',
        stream: false,
        max_tokens: 2048,
      });

      const { augmentedBody } = augmenter.augmentRequest(req);

      expect(augmentedBody.model).toBe('gpt-4');
      expect(augmentedBody.stream).toBe(false);
      expect(augmentedBody.max_tokens).toBe(2048);
    });

    it('should handle content blocks with images', () => {
      const augmenter = createAugmenter(baseConfig);
      const req = createRequest({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: 'iVBORw0KGgoAAAANS...',
                },
              },
            ],
          },
        ],
      });

      const { augmentedBody } = augmenter.augmentRequest(req);

      const userMessage = augmentedBody.messages.find((m) => m.role === 'user');
      expect(userMessage).toBeDefined();
      expect(Array.isArray(userMessage!.content)).toBe(true);
      const content = userMessage!.content as any[];
      expect(content[1].type).toBe('image_url');
      expect(content[1].image_url.url).toContain('data:image/png;base64,');
    });
  });
});
