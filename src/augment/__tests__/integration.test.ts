import { AugmentMiddleware, createAugmentMiddleware } from '../middleware';
import { AugmentConfig } from '../types';

describe('AugmentMiddleware Integration', () => {
  const baseConfig: AugmentConfig = {
    enabled: true,
    modified_system_prompt: 'You are an augmented AI assistant with enhanced capabilities.',
    additional_instructions: [
      'Always provide detailed explanations.',
      'Include code examples when relevant.',
    ],
    extra_context: {
      project_name: 'test-project',
      framework: 'react',
      preferences: {
        style: 'functional',
        testing: 'jest',
      },
    },
    openrouter_endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    openrouter_auth: 'sk-or-test-key',
    detection: {
      header_field: 'x-agent',
      header_value: 'claude-code',
    },
  };

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Full request flow', () => {
    it('should augment and forward Claude Code request', async () => {
      const mockOpenRouterResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-test',
          model: 'gpt-4',
          choices: [
            {
              message: { role: 'assistant', content: 'Augmented response!' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockOpenRouterResponse);

      const middleware = createAugmentMiddleware({
        config: {},
        augmentConfig: baseConfig,
        logger: mockLogger,
      });

      const req = {
        url: '/v1/messages',
        headers: { 'x-agent': 'claude-code' },
        body: {
          model: 'claude-3-sonnet',
          messages: [{ role: 'user', content: 'Write a React component' }],
          system: [{ type: 'text', text: 'Original system prompt' }],
          stream: false,
          max_tokens: 2048,
        },
      };

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        header: jest.fn(),
      };

      const handled = await middleware.handle(req as any, reply);

      expect(handled).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.messages[0].role).toBe('system');
      expect(requestBody.messages[0].content).toBe(baseConfig.modified_system_prompt);

      expect(requestBody.messages[1].content).toBe('Always provide detailed explanations.');
      expect(requestBody.messages[2].content).toBe('Include code examples when relevant.');

      const contextMsg = requestBody.messages.find(
        (m: any) => m.role === 'system' && m.content.includes('<context>')
      );
      expect(contextMsg).toBeDefined();
      expect(contextMsg.content).toContain('test-project');

      const userMsg = requestBody.messages.find((m: any) => m.role === 'user');
      expect(userMsg.content).toBe('Write a React component');
    });

    it('should pass through non-Claude Code requests', async () => {
      const middleware = createAugmentMiddleware({
        config: {},
        augmentConfig: baseConfig,
        logger: mockLogger,
      });

      const req = {
        url: '/v1/messages',
        headers: { 'x-agent': 'other-agent' },
        body: {
          model: 'claude-3-sonnet',
          messages: [{ role: 'user', content: 'Hello' }],
        },
      };

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      const handled = await middleware.handle(req as any, reply);

      expect(handled).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid configuration', async () => {
      const invalidConfig: AugmentConfig = {
        ...baseConfig,
        openrouter_auth: '',
      };

      const middleware = createAugmentMiddleware({
        config: {},
        augmentConfig: invalidConfig,
        logger: mockLogger,
      });

      const req = {
        url: '/v1/messages',
        headers: { 'x-agent': 'claude-code' },
        body: {
          model: 'claude-3-sonnet',
          messages: [{ role: 'user', content: 'Hello' }],
        },
      };

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      const handled = await middleware.handle(req as any, reply);

      expect(handled).toBe(true);
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          error: expect.objectContaining({
            type: 'invalid_request_error',
          }),
        })
      );
    });

    it('should return 502 on network failure', async () => {
      const networkError = new Error('Connection refused');
      (networkError as any).code = 'ECONNREFUSED';
      (global.fetch as jest.Mock).mockRejectedValue(networkError);

      const middleware = createAugmentMiddleware({
        config: {},
        augmentConfig: baseConfig,
        logger: mockLogger,
      });

      const req = {
        url: '/v1/messages',
        headers: { 'x-agent': 'claude-code' },
        body: {
          model: 'claude-3-sonnet',
          messages: [{ role: 'user', content: 'Hello' }],
        },
      };

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      const handled = await middleware.handle(req as any, reply);

      expect(handled).toBe(true);
      expect(reply.status).toHaveBeenCalledWith(502);
      expect(reply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          error: expect.objectContaining({
            type: 'api_error',
          }),
        })
      );
    });

    it('should propagate OpenRouter errors', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            message: 'Rate limit exceeded',
            type: 'rate_limit_error',
          },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockErrorResponse);

      const middleware = createAugmentMiddleware({
        config: {},
        augmentConfig: baseConfig,
        logger: mockLogger,
      });

      const req = {
        url: '/v1/messages',
        headers: { 'x-agent': 'claude-code' },
        body: {
          model: 'claude-3-sonnet',
          messages: [{ role: 'user', content: 'Hello' }],
        },
      };

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      const handled = await middleware.handle(req as any, reply);

      expect(handled).toBe(true);
      expect(reply.status).toHaveBeenCalledWith(429);
    });
  });

  describe('Message preservation', () => {
    it('should preserve conversation history order', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
          usage: {},
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const middleware = createAugmentMiddleware({
        config: {},
        augmentConfig: baseConfig,
        logger: mockLogger,
      });

      const req = {
        url: '/v1/messages',
        headers: { 'x-agent': 'claude-code' },
        body: {
          model: 'claude-3-sonnet',
          messages: [
            { role: 'user', content: 'First user message' },
            { role: 'assistant', content: 'First assistant response' },
            { role: 'user', content: 'Second user message' },
            { role: 'assistant', content: 'Second assistant response' },
            { role: 'user', content: 'Third user message' },
          ],
          stream: false,
        },
      };

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        header: jest.fn(),
      };

      await middleware.handle(req as any, reply);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      const conversationMessages = requestBody.messages.filter(
        (m: any) => m.role === 'user' || m.role === 'assistant'
      );

      expect(conversationMessages).toHaveLength(5);
      expect(conversationMessages[0].content).toBe('First user message');
      expect(conversationMessages[1].content).toBe('First assistant response');
      expect(conversationMessages[2].content).toBe('Second user message');
      expect(conversationMessages[3].content).toBe('Second assistant response');
      expect(conversationMessages[4].content).toBe('Third user message');
    });

    it('should not modify user content', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
          usage: {},
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const middleware = createAugmentMiddleware({
        config: {},
        augmentConfig: baseConfig,
        logger: mockLogger,
      });

      const originalContent = 'This is my exact message with special chars: @#$%^&*()';

      const req = {
        url: '/v1/messages',
        headers: { 'x-agent': 'claude-code' },
        body: {
          model: 'claude-3-sonnet',
          messages: [{ role: 'user', content: originalContent }],
          stream: false,
        },
      };

      const reply = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn(),
        header: jest.fn(),
      };

      await middleware.handle(req as any, reply);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      const userMessage = requestBody.messages.find((m: any) => m.role === 'user');
      expect(userMessage.content).toBe(originalContent);
    });
  });
});
