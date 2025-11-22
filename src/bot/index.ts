import { Bot, session } from 'grammy';
import dotenv from 'dotenv';
import { MyContext, SessionData } from './context';
import { UserRepository } from '../repositories/user.repository';
import { OpenAIService } from '../services/openai.service';
import { setupHandlers } from './handlers';

dotenv.config();

if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN');
}

export const bot = new Bot<MyContext>(process.env.TELEGRAM_BOT_TOKEN);
const userRepository = new UserRepository();

// Session middleware
function initial(): SessionData {
    return { step: 'IDLE' };
}
bot.use(session({ initial }));

// Middleware to ensure user exists in DB
bot.use(async (ctx, next) => {
    if (ctx.from?.id) {
        // In production, maybe cache this to avoid DB hit on every message
        // For now, we just ensure user is created on first interaction
        const user = await userRepository.getUser(ctx.from.id);
        if (!user) {
            await userRepository.createUser(ctx.from.id);
        } else {
            await userRepository.updateLastInteraction(ctx.from.id);
        }
    }
    await next();
});

// Setup command handlers
setupHandlers(bot);

// Error handling
bot.catch((err) => {
    console.error('Error in bot:', err);
});

export async function startBot() {
    console.log('Starting FlattyBot...');
    await bot.start();
}
