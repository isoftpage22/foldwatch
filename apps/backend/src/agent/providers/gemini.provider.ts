import {
  GoogleGenerativeAI,
  Content,
  SchemaType,
  Tool as GeminiTool,
  FunctionDeclaration,
  GenerateContentResult,
  Schema,
} from '@google/generative-ai';
import {
  AiProvider,
  ToolDefinition,
  AgentTurnResult,
  ToolResult,
  ToolCall,
} from './ai-provider.interface';

export class GeminiProvider implements AiProvider {
  readonly providerName = 'gemini';
  private readonly genAI: GoogleGenerativeAI;
  private readonly modelName: string;
  private history: Content[] = [];
  private systemPrompt = '';
  private geminiTools: GeminiTool[] = [];

  constructor(apiKey: string, model?: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.modelName = model || 'gemini-2.0-flash';
  }

  async startConversation(
    systemPrompt: string,
    userMessage: string,
    tools: ToolDefinition[],
  ): Promise<AgentTurnResult> {
    this.systemPrompt = systemPrompt;
    this.geminiTools = this.convertTools(tools);
    this.history = [];

    const userContent: Content = {
      role: 'user',
      parts: [{ text: userMessage }],
    };
    this.history.push(userContent);

    return this.send();
  }

  async continueWithToolResults(
    toolResults: ToolResult[],
  ): Promise<AgentTurnResult> {
    const toolResponseContent: Content = {
      role: 'user',
      parts: toolResults.map((tr) => ({
        functionResponse: {
          name: this.resolveToolName(tr.callId),
          response: this.safeJsonParse(tr.output),
        },
      })),
    };
    this.history.push(toolResponseContent);

    return this.send();
  }

  private safeJsonParse(s: string): Record<string, unknown> {
    try {
      const v = JSON.parse(s);
      return typeof v === 'object' && v !== null && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : { result: v };
    } catch {
      return { raw: s };
    }
  }

  private callIdToNameMap = new Map<string, string>();

  private resolveToolName(callId: string): string {
    return this.callIdToNameMap.get(callId) || callId;
  }

  private async send(): Promise<AgentTurnResult> {
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: this.systemPrompt,
      tools: this.geminiTools,
    });

    const result: GenerateContentResult = await model.generateContent({
      contents: this.history,
    });

    const response = result.response;
    const candidate = response.candidates?.[0];
    if (!candidate || !candidate.content) {
      const reason =
        candidate?.finishReason ||
        response.promptFeedback?.blockReason ||
        'unknown';
      return {
        textContent: `Model returned no content (reason: ${reason})`,
        toolCalls: [],
        done: true,
        tokensUsed: 0,
      };
    }

    const parts = candidate.content.parts || [];

    this.history.push({
      role: 'model',
      parts: [...parts],
    });

    let textContent = '';
    const toolCalls: ToolCall[] = [];

    for (const part of parts) {
      if (part.text) {
        textContent += part.text;
      }
      if (part.functionCall) {
        const callId = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.callIdToNameMap.set(callId, part.functionCall.name);
        toolCalls.push({
          id: callId,
          name: part.functionCall.name,
          input: (part.functionCall.args as Record<string, unknown>) || {},
        });
      }
    }

    const usage = response.usageMetadata;
    const tokensUsed =
      (usage?.promptTokenCount || 0) + (usage?.candidatesTokenCount || 0);

    const done = toolCalls.length === 0;

    return { textContent, toolCalls, done, tokensUsed };
  }

  private convertTools(tools: ToolDefinition[]): GeminiTool[] {
    const declarations: FunctionDeclaration[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: this.buildParametersSchema(t.parameters),
    }));

    return [{ functionDeclarations: declarations }];
  }

  private buildParametersSchema(
    schema: Record<string, unknown>,
  ): {
    type: SchemaType;
    properties: Record<string, Schema>;
    required?: string[];
  } {
    const props = schema.properties as
      | Record<string, Record<string, unknown>>
      | undefined;
    const required = (schema.required as string[]) || [];

    if (!props || Object.keys(props).length === 0) {
      return {
        type: SchemaType.OBJECT,
        properties: {},
      };
    }

    const converted: Record<string, Schema> = {};
    for (const [key, val] of Object.entries(props)) {
      converted[key] = this.jsonPropertyToSchema(val);
    }

    return {
      type: SchemaType.OBJECT,
      properties: converted,
      required: required.length ? required : undefined,
    };
  }

  private jsonPropertyToSchema(prop: Record<string, unknown>): Schema {
    const t = prop.type as string;
    const description = prop.description as string | undefined;

    if (t === 'number' || t === 'integer') {
      return {
        type: t === 'integer' ? SchemaType.INTEGER : SchemaType.NUMBER,
        ...(description ? { description } : {}),
      };
    }
    if (t === 'boolean') {
      return {
        type: SchemaType.BOOLEAN,
        ...(description ? { description } : {}),
      };
    }
    if (t === 'string') {
      const enumVals = prop.enum as string[] | undefined;
      if (enumVals?.length) {
        return {
          type: SchemaType.STRING,
          format: 'enum',
          enum: enumVals,
          ...(description ? { description } : {}),
        };
      }
      return {
        type: SchemaType.STRING,
        ...(description ? { description } : {}),
      };
    }
    return {
      type: SchemaType.STRING,
      ...(description ? { description } : {}),
    };
  }
}
