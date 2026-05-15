import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from '../context';
import { t } from '../../i18n/strings';
import {
    enterLanguageStep,
    enterWelcomeStep,
    runExtractionRound,
    enterRecapStep,
    enterRecapStepEdit,
    enterLocationStep,
    runMarketCheck,
    runPreview,
} from './steps';

function lang(ctx: MyContext) {
    return ctx.session.language ?? 'fr';
}

export function registerOnboardingHandlers(bot: Bot<MyContext>) {

    // ── Language selection ──────────────────────────────────────────────────

    bot.callbackQuery(['lang_fr', 'lang_en'], async (ctx) => {
        if (ctx.session.step !== 'ONBOARDING_LANGUAGE') return;
        ctx.session.language = ctx.callbackQuery.data === 'lang_en' ? 'en' : 'fr';
        await ctx.editMessageText(
            ctx.session.language === 'en'
                ? '🇬🇧 English selected.'
                : '🇫🇷 Français sélectionné.',
        );
        await ctx.answerCallbackQuery();
        await enterWelcomeStep(ctx);
    });

    // ── Text message handler ────────────────────────────────────────────────

    bot.on('message:text', async (ctx, next) => {
        // Let command handlers (/start, /menu, etc.) take precedence
        if (ctx.message.text?.startsWith('/')) return next();

        const step = ctx.session.step;

        if (step === 'AWAITING_AUTHORIZATION') {
            const l = lang(ctx);
            await ctx.reply(
                l === 'en'
                    ? '⏳ Your access request is being reviewed. You\'ll be notified once approved.'
                    : '⏳ Ta demande d\'accès est en cours de validation. Tu seras notifié dès approbation.'
            );
            return;
        }

        if (step === 'ONBOARDING_WAITING_DESCRIPTION' || step === 'ONBOARDING_ASKING_MISSING') {
            await runExtractionRound(ctx, ctx.message.text);
            return;
        }

        if (step === 'ONBOARDING_WAITING_MODIFICATION') {
            ctx.session.existingCriteria = ctx.session.tempCriteria;
            ctx.session.step = 'ONBOARDING_ASKING_MISSING';
            await runExtractionRound(ctx, ctx.message.text);
            return;
        }
    });

    // ── Housing type selection ──────────────────────────────────────────────

    bot.callbackQuery(['type_appart', 'type_coloc', 'type_all'], async (ctx) => {
        if (ctx.session.step !== 'ONBOARDING_WAITING_TYPE_LOGEMENT' || !ctx.session.tempCriteria) return;

        if (ctx.callbackQuery.data === 'type_appart') {
            ctx.session.tempCriteria.criteres_stricts.type_logement = ['appartement', 'studio', 'maison', 'duplex', 'loft'];
        } else if (ctx.callbackQuery.data === 'type_coloc') {
            ctx.session.tempCriteria.criteres_stricts.type_logement = ['colocation', 'chambre', 'chambre partagée'];
        } else {
            ctx.session.tempCriteria.criteres_stricts.type_logement = ['appartement', 'studio', 'maison', 'colocation', 'chambre', 'duplex', 'loft'];
        }

        await ctx.answerCallbackQuery();
        await enterRecapStep(ctx);
    });

    // ── Fallback choices ────────────────────────────────────────────────────

    bot.callbackQuery('fallback_continue', async (ctx) => {
        if (ctx.session.step !== 'ONBOARDING_FALLBACK') return;
        await ctx.editMessageText('▶️ Ok, on continue avec ce que tu m\'as donné !');
        await ctx.answerCallbackQuery();
        await enterRecapStep(ctx);
    });

    bot.callbackQuery('fallback_restart', async (ctx) => {
        if (ctx.session.step !== 'ONBOARDING_FALLBACK') return;
        ctx.session.extractionRounds = 0;
        ctx.session.tempCriteria = undefined;
        ctx.session.conversationHistory = [];
        await ctx.editMessageText('🔄 Ok, on recommence !');
        await ctx.answerCallbackQuery();
        await enterWelcomeStep(ctx);
    });

    // ── Recap actions ───────────────────────────────────────────────────────

    bot.callbackQuery('confirm_criteria', async (ctx) => {
        if (ctx.session.step !== 'ONBOARDING_WAITING_CONFIRMATION' || !ctx.session.tempCriteria) return;
        await ctx.editMessageText(lang(ctx) === 'en' ? '✅ Search confirmed!' : '✅ Critères confirmés !');
        await ctx.answerCallbackQuery();
        await enterLocationStep(ctx);
    });

    bot.callbackQuery('modify_criteria', async (ctx) => {
        if (!ctx.session.tempCriteria) return;
        const l = lang(ctx);
        ctx.session.step = 'ONBOARDING_WAITING_MODIFICATION';
        const kb = new InlineKeyboard().text(t(l, 'cancel_btn'), 'cancel_onboarding');
        await ctx.editMessageText(t(l, 'modify_prompt'), { reply_markup: kb });
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery('restart_onboarding', async (ctx) => {
        ctx.session.extractionRounds = 0;
        ctx.session.tempCriteria = undefined;
        ctx.session.conversationHistory = [];
        await ctx.editMessageText(
            lang(ctx) === 'en' ? '🔄 Let\'s start over!' : '🔄 On recommence !'
        );
        await ctx.answerCallbackQuery();
        await enterWelcomeStep(ctx);
    });

    // ── Location validation ─────────────────────────────────────────────────

    bot.callbackQuery(['conf_loc_all', 'conf_loc_strict'], async (ctx) => {
        if (ctx.session.step !== 'ONBOARDING_WAITING_LOCATION_VALIDATION' || !ctx.session.tempCriteria) return;

        if (ctx.callbackQuery.data === 'conf_loc_all' && ctx.session.suggestedZones) {
            const current = new Set(ctx.session.tempCriteria.criteres_stricts.zones);
            ctx.session.suggestedZones.forEach(z => current.add(z));
            ctx.session.tempCriteria.criteres_stricts.zones = Array.from(current);
        }

        const updatedZones = ctx.session.tempCriteria.criteres_stricts.zones.join(', ');
        await ctx.editMessageText(
            `📍 ${lang(ctx) === 'en' ? 'Zones confirmed' : 'Zones confirmées'} : **${updatedZones}**`,
            { parse_mode: 'Markdown' }
        );
        await ctx.answerCallbackQuery();
        await runMarketCheck(ctx);
    });

    // ── Market decision ─────────────────────────────────────────────────────

    bot.callbackQuery('market_continue', async (ctx) => {
        if (ctx.session.step !== 'ONBOARDING_WAITING_MARKET_DECISION') return;
        await ctx.editMessageText(lang(ctx) === 'en' ? '▶️ Got it, monitoring anyway!' : '▶️ Ok, je surveille quand même !');
        await ctx.answerCallbackQuery();
        await runPreview(ctx);
    });

    // ── Cancel / helpers ────────────────────────────────────────────────────

    bot.callbackQuery('cancel_onboarding', async (ctx) => {
        const l = lang(ctx);
        ctx.session.step = 'IDLE';
        ctx.session.tempCriteria = undefined;
        ctx.session.conversationHistory = undefined;
        ctx.session.existingCriteria = undefined;
        ctx.session.extractionRounds = undefined;
        ctx.session.originalDescription = undefined;

        await ctx.editMessageText(
            l === 'en'
                ? '❌ Onboarding cancelled. Use /start or /menu whenever you\'re ready. 👍'
                : '❌ Onboarding annulé. Tu peux reprendre quand tu veux avec /start ou /menu. 👍'
        );
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery('start_onboarding', async (ctx) => {
        await ctx.editMessageText(
            lang(ctx) === 'en' ? '🚀 Let\'s go!' : '🚀 C\'est parti !'
        );
        await ctx.answerCallbackQuery();
        await enterWelcomeStep(ctx);
    });
}
