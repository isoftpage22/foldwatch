import OpenAI from 'openai';
import {
  AiProvider,
  ToolDefinition,
  AgentTurnResult,
  ToolResult,
  ToolCall,
} from './ai-provider.interface';

export class OpenAiProvider implements AiProvider {
  readonly providerName = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;
  private messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  private openaiTools: OpenAI.Chat.ChatCompletionTool[] = [];

  constructor(apiKey: string, model?: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model || 'gpt-4o';
  }

  async startConversation(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDefinition[],
  ): Promise<AgentTurnResult> {
    this.openaiTools = this.convertTools(tools);
    this.messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    return this.send();
  }

  async continueWithToolResults(
    toolResults: ToolResult[],
  ): Promise<AgentTurnResult> {
    for (const tr of toolResults) {
      this.messages.push({
        role: 'tool',
        tool_call_id: tr.callId,
        content: tr.output,
      });
    }

    return this.send();
  }

  private async send(): Promise<AgentTurnResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      tools: this.openaiTools,
      messages: this.messages,
    });

    const choice = response.choices[0];
    if (!choice) {
      return { textContent: '', toolCalls: [], done: true, tokensUsed: 0 };
    }

    this.messages.push(choice.message);

    const textContent = choice.message.content || '';

    const rawCalls = choice.message.tool_calls || [];
    const toolCalls: ToolCall[] = rawCalls
      .filter(
        (tc): tc is OpenAI.Chat.ChatCompletionMessageFunctionToolCall =>
          tc.type === 'function',
      )
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments || '{}'),
      }));

    const tokensUsed =
      (response.usage?.prompt_tokens || 0) +
      (response.usage?.completion_tokens || 0);

    const hasToolCalls = (choice.message.tool_calls?.length ?? 0) > 0;
    const done = !hasToolCalls;

    return { textContent, toolCalls, done, tokensUsed };
  }

  private convertTools(tools: ToolDefinition[]): OpenAI.Chat.ChatCompletionTool[] {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
}
