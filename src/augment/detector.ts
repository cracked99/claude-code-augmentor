import { AugmentConfig, AugmentRequest } from './types';

export class ClaudeCodeDetector {
  private config: AugmentConfig;

  constructor(config: AugmentConfig) {
    this.config = config;
  }

  isClaudeCodeRequest(req: AugmentRequest): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const { detection } = this.config;

    if (this.checkHeader(req, detection)) {
      return true;
    }

    if (this.checkMetadata(req, detection)) {
      return true;
    }

    return false;
  }

  private checkHeader(
    req: AugmentRequest,
    detection: AugmentConfig['detection']
  ): boolean {
    if (!detection.header_field) {
      return false;
    }

    const headerName = detection.header_field.toLowerCase();
    const headers = req.headers || {};

    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === headerName) {
        if (detection.header_value) {
          return value === detection.header_value;
        }
        return true;
      }
    }

    return false;
  }

  private checkMetadata(
    req: AugmentRequest,
    detection: AugmentConfig['detection']
  ): boolean {
    if (!detection.metadata_field) {
      return false;
    }

    const metadata = req.body?.metadata;
    if (!metadata || typeof metadata !== 'object') {
      return false;
    }

    const fieldValue = this.getNestedValue(metadata, detection.metadata_field);
    
    if (fieldValue === undefined) {
      return false;
    }

    if (detection.metadata_value) {
      return String(fieldValue) === detection.metadata_value;
    }

    return true;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split('.');
    let current: unknown = obj;

    for (const key of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[key];
    }

    return current;
  }
}

export const createDetector = (config: AugmentConfig): ClaudeCodeDetector => {
  return new ClaudeCodeDetector(config);
};
