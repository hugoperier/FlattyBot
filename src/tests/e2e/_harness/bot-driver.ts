/**
 * ConversationDriver — creates a fresh Grammy bot with a captured API, registers
 * all onboarding handlers, and exposes a simple scripting API for E2E tests.
 *
 * The driver creates its OWN Bot instance (separate from the production bot in
 * src/bot/index.ts). Tests should vi.mock('../../bot/index') so that the `bot`
 * import inside steps.ts (used for enterFinalStep's sendMessage) also routes
 * outbound messages through the same recorder.
 */

import { Bot, session } from 'grammy';
import { MyContext, SessionData } from '../../../bot/context';
import { setupHandlers } from '../../../bot/handlers';
import { ReplyRecorder } from './reply-recorder';
import { makeTextUpdate, makeCommandUpdate, makeCallbackUpdate, resetCounters } from './update-factory';

const BOT_INFO = {
    id: 99,
    is_bot: true as const,
    first_name: 'FlattyBot',
    username: 'flattybot',
    can_join_groups: false,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
    can_connect_to_business: false,
    has_main_web_app: false,
};

export class ConversationDriver {
    private bot: Bot<MyContext>;
    private recorder: ReplyRecorder;
    private chatId: number;
    private userId: number;
    private languageCode: string;

    constructor(opts: { userId?: number; chatId?: number; languageCode?: string } = {}) {
        this.userId = opts.userId ?? 12345;
        this.chatId = opts.chatId ?? 12345;
        this.languageCode = opts.languageCode ?? 'fr';

        resetCounters();
        this.recorder = new ReplyRecorder();

        this.bot = new Bot<MyContext>('test:token_placeholder', { botInfo: BOT_INFO });

        // Install API interceptor BEFORE any middleware/handlers
        this.bot.api.config.use(this.recorder.getTransformer() as any);

        // Session middleware — in-memory, fresh per driver instance
        this.bot.use(session({ initial: (): SessionData => ({ step: 'IDLE' }) }));

        // Register all bot handlers (onboarding + commands)
        setupHandlers(this.bot);

        // Catch errors so they surface in test output rather than being swallowed
        this.bot.catch((err) => { throw err.error; });
    }

    /** Fire /start */
    async start() {
        await this.bot.handleUpdate(
            makeCommandUpdate(this.chatId, this.userId, 'start', this.languageCode) as any
        );
    }

    /** Send a free-text message */
    async sendText(text: string) {
        await this.bot.handleUpdate(
            makeTextUpdate(this.chatId, this.userId, text, this.languageCode) as any
        );
    }

    /** Simulate clicking an inline keyboard button by its callback data */
    async clickButton(callbackData: string) {
        await this.bot.handleUpdate(
            makeCallbackUpdate(this.chatId, this.userId, callbackData, this.languageCode) as any
        );
    }

    /** All text the bot sent, in chronological order */
    getReplies(): string[] {
        return this.recorder.getTextMessages();
    }

    /** Full captured API call list */
    getRecorder(): ReplyRecorder {
        return this.recorder;
    }

    /** Helper: returns true if any sent message contains the given substring */
    repliesContain(substring: string): boolean {
        return this.getReplies().some(r => r.includes(substring));
    }

    get uid(): number {
        return this.userId;
    }
}
