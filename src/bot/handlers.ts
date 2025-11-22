import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from './context';
import { OpenAIService } from '../services/openai.service';
import { UserRepository } from '../repositories/user.repository';
import { formatCriteriaSummary } from '../utils/formatting';
import { supabase } from '../config/supabase';

const openaiService = new OpenAIService();
const userRepository = new UserRepository();

export function setupHandlers(bot: Bot<MyContext>) {

    // /start
    bot.command('start', async (ctx) => {
        ctx.session.step = 'ONBOARDING_WAITING_DESCRIPTION';
        await ctx.reply(
            "👋 Salut ! Je suis FlattyBot.\n\n" +
            "Je vais t'aider à trouver l'appartement idéal à Genève. 🏠\n\n" +
            "Dis-moi ce que tu cherches en quelques phrases.\n" +
            "Exemple : *'Je cherche un 3 pièces à Carouge ou Plainpalais, max 2500 CHF. J'aimerais un balcon et si possible le dernier étage.'*",
            { parse_mode: 'Markdown' }
        );
    });

    // /menu
    bot.command('menu', async (ctx) => {
        const keyboard = new InlineKeyboard()
            .text("📋 Mes critères", "view_criteria")
            .text("🔔 Mes alertes", "view_alerts").row()
            .text("⏸️ Pause", "toggle_pause")
            .text("❓ Aide", "help");

        await ctx.reply("Menu Principal", { reply_markup: keyboard });
    });

    // Handle text messages
    bot.on('message:text', async (ctx) => {
        if (ctx.session.step === 'ONBOARDING_WAITING_DESCRIPTION') {
            const description = ctx.message.text;

            await ctx.reply("🔍 J'analyse ta demande... (ça prend quelques secondes)");

            try {
                const criteria = await openaiService.extractCriteria(description);
                ctx.session.tempCriteria = criteria;
                ctx.session.step = 'ONBOARDING_WAITING_CONFIRMATION';

                const summary = formatCriteriaSummary(criteria);

                const keyboard = new InlineKeyboard()
                    .text("✅ C'est tout bon !", "confirm_criteria").row()
                    .text("🔄 Reformuler", "retry_criteria");

                await ctx.reply(summary, { parse_mode: 'Markdown', reply_markup: keyboard });

            } catch (error) {
                console.error(error);
                await ctx.reply("Oups, j'ai eu un petit souci pour comprendre. Peux-tu réessayer ?");
            }
        }
    });

    // Handle callbacks
    bot.callbackQuery('confirm_criteria', async (ctx) => {
        if (ctx.session.step === 'ONBOARDING_WAITING_CONFIRMATION' && ctx.session.tempCriteria) {
            if (!ctx.from?.id) return;

            await userRepository.saveCriteria({
                user_id: ctx.from.id,
                criteres_stricts: ctx.session.tempCriteria.criteres_stricts,
                criteres_confort: ctx.session.tempCriteria.criteres_confort,
                description_originale: "", // We could store the original text if we kept it in session
                resume_humain: ctx.session.tempCriteria.resume_humain,
                confiance_extraction: ctx.session.tempCriteria.confiance,
                updated_at: new Date().toISOString()
            });

            ctx.session.step = 'IDLE';
            ctx.session.tempCriteria = undefined;

            await ctx.editMessageText("✅ Critères enregistrés ! Je commence à chercher pour toi. 🚀");
            await ctx.answerCallbackQuery();
        }
    });

    bot.callbackQuery('retry_criteria', async (ctx) => {
        ctx.session.step = 'ONBOARDING_WAITING_DESCRIPTION';
        await ctx.reply("Pas de souci. Dis-moi à nouveau ce que tu cherches (tu peux être plus précis).");
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery('view_criteria', async (ctx) => {
        if (!ctx.from?.id) return;
        const criteria = await userRepository.getCriteria(ctx.from.id);
        if (criteria) {
            // Reconstruct ExtractedCriteria structure for formatting
            // Note: This is a bit hacky, ideally we share types better or store as is
            const formatted = formatCriteriaSummary({
                criteres_stricts: criteria.criteres_stricts,
                criteres_confort: criteria.criteres_confort,
                criteres_manquants: [],
                confiance: criteria.confiance_extraction,
                resume_humain: criteria.resume_humain
            });
            await ctx.reply(formatted, { parse_mode: 'Markdown' });
        } else {
            await ctx.reply("Tu n'as pas encore défini de critères. Fais /start !");
        }
        await ctx.answerCallbackQuery();
    });

    // Pause/Resume
    bot.command('pause', async (ctx) => {
        if (!ctx.from?.id) return;
        // Assuming 'supabase' is defined elsewhere or imported
        await supabase.from('users').update({ is_paused: true }).eq('telegram_id', ctx.from.id);
        await ctx.reply("⏸️ Alertes mises en pause. Fais /resume pour reprendre.");
    });

    bot.command('resume', async (ctx) => {
        if (!ctx.from?.id) return;
        // Assuming 'supabase' is defined elsewhere or imported
        await supabase.from('users').update({ is_paused: false }).eq('telegram_id', ctx.from.id);
        await ctx.reply("▶️ Alertes réactivées !");
    });

    bot.callbackQuery('toggle_pause', async (ctx) => {
        if (!ctx.from?.id) return;
        const user = await userRepository.getUser(ctx.from.id);
        if (user) {
            const newState = !user.is_paused;
            // Assuming 'supabase' is defined elsewhere or imported
            await supabase.from('users').update({ is_paused: newState }).eq('telegram_id', ctx.from.id);
            await ctx.reply(newState ? "⏸️ Alertes mises en pause." : "▶️ Alertes réactivées !");
        }
        await ctx.answerCallbackQuery();
    });
}
