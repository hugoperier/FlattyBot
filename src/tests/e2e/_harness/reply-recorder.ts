/**
 * Grammy API transformer that intercepts all outbound bot calls, records them,
 * and returns plausible fake responses so handler code keeps running.
 */

export interface CapturedMessage {
    method: string;
    chatId: number | string;
    text: string | undefined;
    messageId?: number;
    payload: Record<string, unknown>;
}

export class ReplyRecorder {
    private calls: CapturedMessage[] = [];
    private _nextMsgId = 5000;

    private nextMsgId() { return ++this._nextMsgId; }

    /** Grammy API transformer — install on bot.api.config before handlers are registered. */
    getTransformer() {
        return async (_prev: unknown, method: string, payload: Record<string, unknown>): Promise<unknown> => {
            const chatId = (payload.chat_id ?? payload.inline_message_id ?? 0) as number | string;
            const text = (payload.text ?? undefined) as string | undefined;
            const messageId = (payload.message_id ?? undefined) as number | undefined;

            this.calls.push({ method, chatId, text, messageId, payload });

            const fakeMsgId = this.nextMsgId();

            switch (method) {
                case 'sendMessage':
                    return {
                        ok: true,
                        result: {
                            message_id: fakeMsgId,
                            date: Math.floor(Date.now() / 1000),
                            chat: { id: chatId, type: 'private' },
                            from: { id: 99, is_bot: true, first_name: 'FlattyBot' },
                            text: payload.text ?? '',
                        },
                    };
                case 'editMessageText':
                    return {
                        ok: true,
                        result: {
                            message_id: messageId ?? fakeMsgId,
                            text: payload.text ?? '',
                            date: Math.floor(Date.now() / 1000),
                            chat: { id: chatId, type: 'private' },
                        },
                    };
                case 'answerCallbackQuery':
                    return { ok: true, result: true };
                case 'getMe':
                    return {
                        ok: true,
                        result: {
                            id: 99,
                            is_bot: true,
                            first_name: 'FlattyBot',
                            username: 'flattybot',
                            can_join_groups: false,
                            can_read_all_group_messages: false,
                            supports_inline_queries: false,
                        },
                    };
                case 'deleteMessage':
                    return { ok: true, result: true };
                default:
                    return { ok: true, result: {} };
            }
        };
    }

    /** All raw captured calls. */
    getCalls(): CapturedMessage[] {
        return [...this.calls];
    }

    /** Text of every sendMessage and editMessageText, in order. */
    getTextMessages(): string[] {
        return this.calls
            .filter(c => c.method === 'sendMessage' || c.method === 'editMessageText')
            .map(c => c.text ?? '')
            .filter(Boolean);
    }

    /** True if a given API method was ever called. */
    methodWasCalled(method: string): boolean {
        return this.calls.some(c => c.method === method);
    }

    /** Number of times sendMessage was called. */
    sendMessageCount(): number {
        return this.calls.filter(c => c.method === 'sendMessage').length;
    }

    reset(): void {
        this.calls = [];
    }
}
