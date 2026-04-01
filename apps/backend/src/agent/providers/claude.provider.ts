import Anthropic from '@anthropic-ai/sdk';
import {
  AiProvider,
  ToolDefinition,
  AgentTurnResult,
  ToolResult,
  ToolCall,
} from './ai-provider.interface';

export class ClaudeProvider implements AiProvider {
  readonly providerName = 'claude';
  private readonly client: Anthropic;
  private readonly model: string;
  private messages: Anthropic.MessageParam[] = [];
  private systemPrompt = '';
  private claudeTools: Anthropic.Tool[] = [];

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model || 'claude-sonnet-4-20250514';
  }

  async startConversation(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDefinition[],
  ): Promise<AgentTurnResult> {
    this.systemPrompt = systemPrompt;
    this.claudeTools = this.convertTools(tools);
    this.messages = [{ role: 'user', content: userMessage }];

    return this.send();
  }

  async continueWithToolResults(
    toolResults: ToolResult[],
  ): Promise<AgentTurnResult> {
    const blocks: Anthropic.ToolResultBlockParam[] = toolResults.map((tr) => ({
      type: 'tool_result' as const,
      tool_use_id: tr.callId,
      content: tr.output,
    }));

    this.messages.push({ role: 'user', content: blocks });

    return this.send();
  }

  private async send(): Promise<AgentTurnResult> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system: this.systemPrompt,
      tools: this.claudeTools,
      messages: this.messages,
    });

    this.messages.push({ role: 'assistant', content: response.content });

    const textContent = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const toolCalls: ToolCall[] = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      .map((b) => ({
        id: b.id,
        name: b.name,
        input: b.input as Record<string, unknown>,
      }));

    const tokensUsed =
      response.usage.input_tokens + response.usage.output_tokens;

    const done = response.stop_reason !== 'tool_use';

    return { textContent, toolCalls, done, tokensUsed };
  }

  private convertTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool['input_schema'],
    }));
  }
}
