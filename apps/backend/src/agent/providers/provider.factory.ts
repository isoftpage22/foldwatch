import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from './ai-provider.interface';
import { GeminiProvider } from './gemini.provider';
import { ClaudeProvider } from './claude.provider';
import { OpenAiProvider } from './openai.provider';

export type AiProviderType = 'gemini' | 'claude' | 'openai';

const logger = new Logger('AiProviderFactory');

export function createAiProvider(config: ConfigService): AiProvider {
  const providerType =
    (config.get<string>('ai.provider') as AiProviderType) || 'gemini';

  logger.log(`Initializing AI provider: ${providerType}`);

  switch (providerType) {
    case 'gemini': {
      const key = config.get<string>('ai.geminiApiKey');
      if (!key) throw new Error('GEMINI_API_KEY is required when AI_PROVIDER=gemini');
      const model = config.get<string>('ai.geminiModel');
      return new GeminiProvider(key, model);
    }

    case 'claude': {
      const key = config.get<string>('ai.anthropicApiKey');
      if (!key) throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=claude');
      const model = config.get<string>('ai.claudeModel');
      return new ClaudeProvider(key, model);
    }

    case 'openai': {
      const key = config.get<string>('ai.openaiApiKey');
      if (!key) throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
      const model = config.get<string>('ai.openaiModel');
      return new OpenAiProvider(key, model);
    }

    default:
      throw new Error(
        `Unknown AI_PROVIDER: "${providerType}". Must be one of: gemini, claude, openai`,
      );
  }
}
