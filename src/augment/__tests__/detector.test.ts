import { ClaudeCodeDetector, createDetector } from '../detector';
import { AugmentConfig, AugmentRequest } from '../types';

describe('ClaudeCodeDetector', () => {
  const baseConfig: AugmentConfig = {
    enabled: true,
    openrouter_endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    openrouter_auth: 'test-auth',
    detection: {
      header_field: 'x-agent',
      header_value: 'claude-code',
      metadata_field: 'agent',
      metadata_value: 'claude-code',
    },
  };

  const createRequest = (
    headers: Record<string, string> = {},
    metadata: Record<string, unknown> = {}
  ): AugmentRequest => ({
    body: {
      model: 'test-model',
      messages: [],
      metadata,
    },
    headers,
  });

  describe('isClaudeCodeRequest', () => {
    it('should return false when augmentation is disabled', () => {
      const config = { ...baseConfig, enabled: false };
      const detector = createDetector(config);
      const req = createRequest({ 'x-agent': 'claude-code' });

      expect(detector.isClaudeCodeRequest(req)).toBe(false);
    });

    it('should detect Claude Code request via header', () => {
      const detector = createDetector(baseConfig);
      const req = createRequest({ 'x-agent': 'claude-code' });

      expect(detector.isClaudeCodeRequest(req)).toBe(true);
    });

    it('should detect Claude Code request via header (case insensitive)', () => {
      const detector = createDetector(baseConfig);
      const req = createRequest({ 'X-Agent': 'claude-code' });

      expect(detector.isClaudeCodeRequest(req)).toBe(true);
    });

    it('should not detect when header value does not match', () => {
      const detector = createDetector(baseConfig);
      const req = createRequest({ 'x-agent': 'other-agent' });

      expect(detector.isClaudeCodeRequest(req)).toBe(false);
    });

    it('should detect Claude Code request via metadata', () => {
      const detector = createDetector(baseConfig);
      const req = createRequest({}, { agent: 'claude-code' });

      expect(detector.isClaudeCodeRequest(req)).toBe(true);
    });

    it('should detect Claude Code request via nested metadata', () => {
      const config: AugmentConfig = {
        ...baseConfig,
        detection: {
          metadata_field: 'source.agent',
          metadata_value: 'claude-code',
        },
      };
      const detector = createDetector(config);
      const req = createRequest({}, { source: { agent: 'claude-code' } });

      expect(detector.isClaudeCodeRequest(req)).toBe(true);
    });

    it('should return false when no detection criteria match', () => {
      const detector = createDetector(baseConfig);
      const req = createRequest({}, { other: 'data' });

      expect(detector.isClaudeCodeRequest(req)).toBe(false);
    });

    it('should detect when header field exists (no value check)', () => {
      const config: AugmentConfig = {
        ...baseConfig,
        detection: {
          header_field: 'x-claude-code',
          // No header_value specified
        },
      };
      const detector = createDetector(config);
      const req = createRequest({ 'x-claude-code': 'anything' });

      expect(detector.isClaudeCodeRequest(req)).toBe(true);
    });

    it('should detect when metadata field exists (no value check)', () => {
      const config: AugmentConfig = {
        ...baseConfig,
        detection: {
          metadata_field: 'claude_request',
          // No metadata_value specified
        },
      };
      const detector = createDetector(config);
      const req = createRequest({}, { claude_request: true });

      expect(detector.isClaudeCodeRequest(req)).toBe(true);
    });
  });
});
