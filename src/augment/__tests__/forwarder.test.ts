import { OpenRouterForwarder, createForwarder } from '../forwarder';
import { AugmentConfig, OpenRouterRequest } from '../types';

describe('OpenRouterForwarder', () => {
  const baseConfig: AugmentConfig = {
    enabled: true,
    openrouter_endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    openrouter_auth: 'test-auth-token',
    detection: {},
  };

  const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  };

  const createMockRequest = (): OpenRouterRequest => ({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hello!' },
    ],
    stream: false,
    max_tokens: 1024,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('forward', () => {
    it('should forward request to OpenRouter with correct headers', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          id: 'chatcmpl-123',
          choices: [{ message: { content: 'Hello back!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const forwarder = createForwarder(baseConfig, mockLogger);
      const req = createMockRequest();

      const result = await forwarder.forward(req, false);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        baseConfig.openrouter_endpoint,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-auth-token',
          }),
        })
      );
    });

    it('should return error on HTTP error response', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ message: 'Invalid API key' }),
      };
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const forwarder = createForwarder(baseConfig, mockLogger);
      const req = createMockRequest();

      const result = await forwarder.forward(req, false);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(401);
      expect(result.error).toContain('Invalid API key');
    });

    it('should return 502 on network error', async () => {
      const networkError = new Error('Network failure');
      (networkError as any).code = 'ECONNREFUSED';
      (global.fetch as jest.Mock).mockRejectedValue(networkError);

      const forwarder = createForwarder(baseConfig, mockLogger);
      const req = createMockRequest();

      const result = await forwarder.forward(req, false);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(502);
      expect(result.error).toContain('Network error');
    });

    it('should return 502 on timeout error', async () => {
      const timeoutError = new Error('Request timed out');
      (timeoutError as any).code = 'ETIMEDOUT';
      (global.fetch as jest.Mock).mockRejectedValue(timeoutError);

      const forwarder = createForwarder(baseConfig, mockLogger);
      const req = createMockRequest();

      const result = await forwarder.forward(req, false);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe(502);
    });
  });

  describe('handleNonStreamingResponse', () => {
    it('should convert OpenRouter response to Anthropic format', async () => {
      const mockResponse = {
        json: async () => ({
          id: 'chatcmpl-123',
          model: 'gpt-4',
          choices: [
            {
              message: { role: 'assistant', content: 'Hello there!' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 15, completion_tokens: 8 },
        }),
      } as Response;

      const forwarder = createForwarder(baseConfig, mockLogger);
      const result = await forwarder.handleNonStreamingResponse(mockResponse);

      expect(result.type).toBe('message');
      expect(result.role).toBe('assistant');
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toBe('Hello there!');
      expect(result.stop_reason).toBe('end_turn');
      expect(result.usage.input_tokens).toBe(15);
      expect(result.usage.output_tokens).toBe(8);
    });

    it('should map finish_reason correctly', async () => {
      const testCases = [
        { input: 'stop', expected: 'end_turn' },
        { input: 'length', expected: 'max_tokens' },
        { input: 'tool_calls', expected: 'tool_use' },
        { input: 'function_call', expected: 'tool_use' },
      ];

      for (const testCase of testCases) {
        const mockResponse = {
          json: async () => ({
            choices: [
              {
                message: { content: 'test' },
                finish_reason: testCase.input,
              },
            ],
            usage: {},
          }),
        } as Response;

        const forwarder = createForwarder(baseConfig, mockLogger);
        const result = await forwarder.handleNonStreamingResponse(mockResponse);

        expect(result.stop_reason).toBe(testCase.expected);
      }
    });
  });
});
