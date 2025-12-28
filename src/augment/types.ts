export interface AugmentConfig {
  enabled: boolean;
  modified_system_prompt?: string;
  additional_instructions?: string[];
  extra_context?: Record<string, unknown>;
  openrouter_endpoint: string;
  openrouter_auth: string;
  detection: {
    header_field?: string;
    header_value?: string;
    metadata_field?: string;
    metadata_value?: string;
  };
}

export interface AugmentRequest {
  body: {
    model: string;
    messages: MessageParam[];
    system?: SystemPrompt[];
    tools?: any[];
    stream?: boolean;
    max_tokens?: number;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
  headers: Record<string, string>;
}

export interface MessageParam {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result';
  text?: string;
  [key: string]: unknown;
}

export interface SystemPrompt {
  type: 'text';
  text: string;
  cache_control?: { type: string };
}

export interface AugmentResult {
  success: boolean;
  augmented: boolean;
  error?: string;
  errorCode?: number;
}

export interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  stream?: boolean;
  temperature?: number;
  tools?: any[];
  [key: string]: unknown;
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenRouterContentBlock[];
}

export interface OpenRouterContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}
