export * from './types';
export * from './detector';
export * from './augmenter';
export * from './forwarder';
export * from './middleware';

import { AugmentConfig } from './types';

export const DEFAULT_AUGMENT_CONFIG: AugmentConfig = {
  enabled: false,
  modified_system_prompt: undefined,
  additional_instructions: [],
  extra_context: undefined,
  openrouter_endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  openrouter_auth: '',
  detection: {
    header_field: 'x-agent',
    header_value: 'claude-code',
    metadata_field: 'agent',
    metadata_value: 'claude-code',
  },
};

export const validateAugmentConfig = (config: Partial<AugmentConfig>): {
  valid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (config.enabled) {
    if (!config.openrouter_endpoint) {
      errors.push('openrouter_endpoint is required when augmentation is enabled');
    }

    if (!config.openrouter_auth) {
      errors.push('openrouter_auth is required when augmentation is enabled');
    }

    if (
      config.additional_instructions &&
      !Array.isArray(config.additional_instructions)
    ) {
      errors.push('additional_instructions must be an array of strings');
    }

    if (
      config.extra_context &&
      typeof config.extra_context !== 'object'
    ) {
      errors.push('extra_context must be a JSON object');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const mergeAugmentConfig = (
  base: AugmentConfig,
  override: Partial<AugmentConfig>
): AugmentConfig => {
  return {
    ...base,
    ...override,
    detection: {
      ...base.detection,
      ...override.detection,
    },
  };
};
