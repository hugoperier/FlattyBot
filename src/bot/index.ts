import { Bot, session, InlineKeyboard } from 'grammy';
import dotenv from 'dotenv';
import { MyContext, SessionData } from './context';
import { UserRepository } from '../repositories/user.repository';
import { OpenAIService } from '../services/openai.service';
import { setupHandlers } from './handlers';
import { ADMIN_TELEGRAM_ID } from '../config/admin';

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

// Middleware to handle user creation and authorization
bot.use(async (ctx, next) => {
    if (ctx.from?.id) {
        const user = await userRepository.getUser(ctx.from.id);

        if (!user) {
            // Create new user with pending authorization
            const newUser = await userRepository.createUser(ctx.from.id);

            if (newUser && ADMIN_TELEGRAM_ID) {
                // Send notification to admin
                const username = ctx.from.username ? `@${ctx.from.username}` : 'Sans username';
                const firstName = ctx.from.first_name || 'Utilisateur';
                const lastName = ctx.from.last_name ? ` ${ctx.from.last_name}` : '';

                const keyboard = new InlineKeyboard()
                    .text("✅ Approuver", `approve_user_${ctx.from.id}`)
                    .text("❌ Rejeter", `reject_user_${ctx.from.id}`);

                try {
                    await bot.api.sendMessage(
                        ADMIN_TELEGRAM_ID,
                        `🔔 **Nouvelle demande d'accès**\n\n` +
                        `👤 **Utilisateur** : ${firstName}${lastName}\n` +
                        `📱 **Username** : ${username}\n` +
                        `🆔 **Telegram ID** : \`${ctx.from.id}\`\n\n` +
                        `Voulez-vous autoriser cet utilisateur ?`,
                        { parse_mode: 'Markdown', reply_markup: keyboard }
                    );
                } catch (error) {
                    console.error('Error sending admin notification:', error);
                }
            }
        } else {
            // Update last interaction for existing users
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
