import { AugmentConfig, AugmentRequest } from './types';
import { ClaudeCodeDetector, createDetector } from './detector';
import { RequestAugmenter, createAugmenter } from './augmenter';
import { OpenRouterForwarder, createForwarder } from './forwarder';

export interface AugmentMiddlewareContext {
  config: any;
  augmentConfig: AugmentConfig;
  logger?: any;
}

export class AugmentMiddleware {
  private detector: ClaudeCodeDetector;
  private augmenter: RequestAugmenter;
  private forwarder: OpenRouterForwarder;
  private config: AugmentConfig;
  private logger: any;

  constructor(context: AugmentMiddlewareContext) {
    this.config = context.augmentConfig;
    this.logger = context.logger || console;
    this.detector = createDetector(this.config);
    this.augmenter = createAugmenter(this.config);
    this.forwarder = createForwarder(this.config, this.logger);
  }

  async handle(req: any, reply: any): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    const augmentRequest: AugmentRequest = {
      body: req.body,
      headers: req.headers as Record<string, string>,
    };

    if (!this.detector.isClaudeCodeRequest(augmentRequest)) {
      this.logger.debug?.({
        msg: 'Request does not match Claude Code detection criteria',
        url: req.url,
      });
      return false;
    }

    this.logger.info?.({
      msg: 'Claude Code request detected, applying augmentation',
      url: req.url,
    });

    const { augmentedBody, result } = this.augmenter.augmentRequest(augmentRequest);

    if (!result.success) {
      reply.status(result.errorCode || 400).send({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: result.error,
        },
      });
      return true;
    }

    const isStreaming = req.body.stream !== false;
    const forwardResult = await this.forwarder.forward(augmentedBody, isStreaming);

    if (!forwardResult.success) {
      reply.status(forwardResult.errorCode || 500).send({
        type: 'error',
        error: {
          type: forwardResult.errorCode === 502 ? 'api_error' : 'invalid_request_error',
          message: forwardResult.error,
        },
      });
      return true;
    }

    if (isStreaming && forwardResult.response) {
      reply.header('Content-Type', 'text/event-stream');
      reply.header('Cache-Control', 'no-cache');
      reply.header('Connection', 'keep-alive');

      const transformedStream = await this.forwarder.handleStreamingResponse(
        forwardResult.response
      );
      reply.send(transformedStream);
    } else if (forwardResult.response) {
      const responseData = await this.forwarder.handleNonStreamingResponse(
        forwardResult.response
      );
      reply.send(responseData);
    }

    return true;
  }
}

export const createAugmentMiddleware = (
  context: AugmentMiddlewareContext
): AugmentMiddleware => {
  return new AugmentMiddleware(context);
};

export const augmentPreHandler = (augmentConfig: AugmentConfig, logger?: any) => {
  return async (req: any, reply: any) => {
    if (!req.url.startsWith('/v1/messages')) {
      return;
    }

    if (req.url.includes('/count_tokens')) {
      return;
    }

    const middleware = createAugmentMiddleware({
      config: {},
      augmentConfig,
      logger: logger || req.log,
    });

    const handled = await middleware.handle(req, reply);

    if (handled) {
      return reply;
    }
  };
};
