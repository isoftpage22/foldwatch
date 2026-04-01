export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AgentTurnResult {
  textContent: string;
  toolCalls: ToolCall[];
  done: boolean;
  tokensUsed: number;
}

export interface ToolResult {
  callId: string;
  output: string;
}

export interface AiProvider {
  readonly providerName: string;

  startConversation(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDefinition[],
  ): Promise<AgentTurnResult>;

  continueWithToolResults(
    toolResults: ToolResult[],
  ): Promise<AgentTurnResult>;
}
