import type { ModelMessage } from 'ai';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ToolCallPart {
  type: 'tool-call';
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResultPart {
  type: 'tool-result';
  /** `id` of the tool call this answers. */
  callId: string;
  name: string;
  output: string;
  isError: boolean;
}

/** Provider-neutral message; `LlmClient` translates it for each provider. */
export type Message =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | (TextPart | ToolCallPart)[] }
  | { role: 'tool'; content: ToolResultPart[] };

export function toModelMessages(messages: Message[]): ModelMessage[] {
  return messages.map((message): ModelMessage => {
    switch (message.role) {
      case 'user':
        return { role: 'user', content: message.content };
      case 'assistant':
        return {
          role: 'assistant',
          content:
            typeof message.content === 'string'
              ? message.content
              : message.content.map((part) =>
                  part.type === 'text'
                    ? part
                    : {
                        type: 'tool-call',
                        toolCallId: part.id,
                        toolName: part.name,
                        input: part.input,
                      },
                ),
        };
      case 'tool':
        return {
          role: 'tool',
          content: message.content.map((part) => ({
            type: 'tool-result',
            toolCallId: part.callId,
            toolName: part.name,
            output: { type: part.isError ? 'error-text' : 'text', value: part.output },
          })),
        };
    }
  });
}
