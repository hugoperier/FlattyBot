import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from './context';
import { UserRepository } from '../repositories/user.repository';
import { AlertRepository } from '../repositories/alert.repository';
import { formatCriteriaSummary } from '../utils/formatting';
import { supabase } from '../config/supabase';
import { ADMIN_TELEGRAM_ID } from '../config/admin';
import { registerOnboardingHandlers } from './onboarding/index';
import { enterLanguageStep, enterWelcomeStep } from './onboarding/steps';
import { Lang } from '../i18n/strings';

const userRepository = new UserRepository();
const alertRepository = new AlertRepository();
const pendingMessages = new Map<number, number>(); // telegramId → messageId of pending authorization

function detectLang(ctx: MyContext): Lang {
    const code = ctx.from?.language_code ?? '';
    return code.startsWith('fr') ? 'fr' : 'en';
}

export function setupHandlers(bot: Bot<MyContext>) {

    registerOnboardingHandlers(bot);

    // /start — language detection then welcome
    bot.command('start', async (ctx) => {
        if (!ctx.from?.id) return;

        const user = await userRepository.createUser({
            telegram_id: ctx.from.id,
            first_name: ctx.from.first_name,
            last_name: ctx.from.last_name,
            username: ctx.from.username,
            language_code: ctx.from.language_code
        });

        if (!user) {
            await ctx.reply('❌ Une erreur s\'est produite. Merci de réessayer.');
            return;
        }

        if (user.pending_authorization) {
            ctx.session.step = 'AWAITING_AUTHORIZATION';
            const pendingMsg = await ctx.reply(
                '⏳ **Demande en cours**\n\nTa demande d\'accès est en attente de validation.\n\n_Tu seras notifié dès que ton accès sera validé._',
                { parse_mode: 'Markdown' }
            );
            pendingMessages.set(ctx.from.id, pendingMsg.message_id);
            return;
        }

        // Auto-detect language; ask only when non-FR
        const detectedLang = detectLang(ctx);
        if (detectedLang !== 'fr') {
            ctx.session.language = undefined; // force choice
            await enterLanguageStep(ctx);
        } else {
            ctx.session.language = 'fr';
            await enterWelcomeStep(ctx);
        }
    });

    // /menu
    bot.command('menu', async (ctx) => {
        if (!ctx.from?.id) return;

        const user = await userRepository.getUser(ctx.from.id);
        if (user && !user.is_active) {
            await userRepository.updateLastInteraction(ctx.from.id);
        }

        const isInactive = user && !user.is_active;
        const isPaused = user?.is_paused ?? false;

        let menuText = '🏠 *Menu Principal*';
        if (isInactive) {
            menuText = '⚠️ *Tes alertes étaient en veille*\nJe les ai réactivées automatiquement. 🎉\n\n🏠 *Menu Principal*';
        } else if (isPaused) {
            menuText = '⏸️ *Tes alertes sont en pause*\n\n🏠 *Menu Principal*';
        }

        const keyboard = new InlineKeyboard()
            .text('📋 Mes critères', 'view_criteria')
            .text('🔔 Mes alertes', 'view_alerts').row()
            .text(isPaused ? '▶️ Reprendre' : '⏸️ Pause', 'toggle_pause')
            .text('❓ Aide', 'help');

        await ctx.reply(menuText, { parse_mode: 'Markdown', reply_markup: keyboard });
    });

    // /pause + /resume
    bot.command('pause', async (ctx) => {
        if (!ctx.from?.id) return;
        await supabase.from('users').update({ is_paused: true }).eq('telegram_id', ctx.from.id);
        await ctx.reply('⏸️ Alertes mises en pause. Fais /resume pour reprendre.');
    });

    bot.command('resume', async (ctx) => {
        if (!ctx.from?.id) return;
        await supabase.from('users').update({ is_paused: false }).eq('telegram_id', ctx.from.id);
        await ctx.reply('▶️ Alertes réactivées !');
    });

    // ── Menu callbacks ──────────────────────────────────────────────────────

    bot.callbackQuery('view_criteria', async (ctx) => {
        if (!ctx.from?.id) return;
        const criteria = await userRepository.getCriteria(ctx.from.id);
        if (criteria) {
            const formatted = formatCriteriaSummary({
                criteres_stricts: criteria.criteres_stricts,
                criteres_confort: criteria.criteres_confort,
                criteres_manquants: [],
                question_followup: null,
                confiance: criteria.confiance_extraction,
                resume_humain: criteria.resume_humain
            });
            const keyboard = new InlineKeyboard().text('✏️ Modifier mes critères', 'start_onboarding');
            await ctx.reply(formatted, { parse_mode: 'Markdown', reply_markup: keyboard });
        } else {
            await ctx.reply('Tu n\'as pas encore défini de critères. Fais /start !');
        }
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery('view_alerts', async (ctx) => {
        if (!ctx.from?.id) return;

        const alerts = await alertRepository.getUserAlerts(ctx.from.id, 10);
        if (alerts.length === 0) {
            await ctx.reply('Tu n\'as encore reçu aucune alerte. 📭\n\nJe te préviendrai dès qu\'une annonce correspondant à tes critères sera publiée ! 🔔');
            await ctx.answerCallbackQuery();
            return;
        }

        const alertsWithDetails = await Promise.all(
            alerts.map(async (alert) => {
                const { data: ad } = await supabase
                    .from('fb_annonces_location')
                    .select('*, facebook_posts(post_id, time_posted, input_data)')
                    .eq('id', alert.annonce_id)
                    .single();
                return { alert, ad };
            })
        );

        let message = `🔔 **Tes ${alerts.length} dernières alertes**\n\n`;
        alertsWithDetails.forEach(({ alert, ad }, index) => {
            if (!ad) return;
            const type = ad.type_logement || 'Logement';
            const pieces = ad.nombre_pieces ? `${ad.nombre_pieces} pièce${ad.nombre_pieces > 1 ? 's' : ''}` : '';
            const prix = ad.loyer_total ? `${ad.loyer_total} CHF` : 'Prix à discuter';
            const quartier = ad.quartier || ad.ville || 'Genève';
            message += `**${index + 1}.** ${type}${pieces ? ` - ${pieces}` : ''}\n`;
            message += `📍 ${quartier} • 💰 ${prix}\n`;
            message += `⭐️ Score: ${alert.score_total}/100`;
            if (alert.badges.length > 0) message += ` ${alert.badges.join(' ')}`;
            message += '\n\n';
        });
        message += '💡 *Utilise /menu pour voir toutes les options*';

        await ctx.reply(message, { parse_mode: 'Markdown' });
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery('toggle_pause', async (ctx) => {
        if (!ctx.from?.id) return;
        const user = await userRepository.getUser(ctx.from.id);
        if (user) {
            const newState = !user.is_paused;
            await supabase.from('users').update({ is_paused: newState }).eq('telegram_id', ctx.from.id);
            await ctx.reply(newState ? '⏸️ Alertes mises en pause.' : '▶️ Alertes réactivées !');
        }
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery('reactivate_alerts', async (ctx) => {
        if (!ctx.from?.id) return;
        await userRepository.updateLastInteraction(ctx.from.id);
        await ctx.editMessageText(
            '✅ *Tes alertes sont de nouveau actives !*\n\nJe reprends ma veille et te préviendrai dès qu\'une annonce correspondant à tes critères sera publiée. 🔔\n\n💡 Tu peux aussi accéder au menu complet avec /menu.',
            { parse_mode: 'Markdown' }
        );
        await ctx.answerCallbackQuery('Alertes réactivées ! 🎉');
    });

    bot.callbackQuery('back_to_menu', async (ctx) => {
        if (!ctx.from?.id) return;
        const user = await userRepository.getUser(ctx.from.id);
        if (user && !user.is_active) {
            await userRepository.updateLastInteraction(ctx.from.id);
        }
        const isPaused = user?.is_paused ?? false;
        const keyboard = new InlineKeyboard()
            .text('📋 Mes critères', 'view_criteria')
            .text('🔔 Mes alertes', 'view_alerts').row()
            .text(isPaused ? '▶️ Reprendre' : '⏸️ Pause', 'toggle_pause')
            .text('❓ Aide', 'help');
        await ctx.editMessageText('🏠 *Menu Principal*', { parse_mode: 'Markdown', reply_markup: keyboard });
        await ctx.answerCallbackQuery();
    });

    // ── Help system ─────────────────────────────────────────────────────────

    bot.callbackQuery('help', async (ctx) => {
        if (!ctx.from?.id) return;
        const user = await userRepository.getUser(ctx.from.id);
        const criteria = await userRepository.getCriteria(ctx.from.id);

        let message = '❓ **Aide FlattyBot**\n\n';
        const keyboard = new InlineKeyboard();

        if (!criteria) {
            message += 'Fais /start pour commencer à configurer tes critères de recherche ! 🚀';
            keyboard.text('🚀 Commencer', 'start_onboarding').row().text('📚 En savoir plus', 'help_how_it_works');
        } else {
            if (user?.is_paused) {
                message += '⚠️ **Tes alertes sont actuellement en pause.**\n\n';
                keyboard.text('▶️ Réactiver les alertes', 'toggle_pause').row();
            } else {
                message += '✅ Tu es bien configuré et je cherche activement pour toi ! 🎯\n\n';
            }
            message += 'Voici ce que tu peux faire :';
            keyboard
                .text('📚 Commandes', 'help_commands').text('🔍 Critères', 'help_criteria').row()
                .text('🔔 Alertes', 'help_alerts').text('⚙️ Gestion', 'help_manage').row()
                .text('🏠 Menu Principal', 'back_to_menu');
        }

        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery('help_commands', async (ctx) => {
        const message =
            '📚 **Commandes Disponibles**\n\n' +
            '• `/start` - Configurer ou modifier tes critères\n' +
            '• `/menu` - Menu principal\n' +
            '• `/pause` - Mettre en pause les alertes\n' +
            '• `/resume` - Réactiver les alertes';
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard().text('◀️ Retour', 'help').text('🏠 Menu', 'back_to_menu')
        });
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery('help_criteria', async (ctx) => {
        const message =
            '🔍 **Comprendre les Critères**\n\n' +
            '**🔒 Critères Stricts** (Deal-breakers)\n' +
            '• Budget max, zones/quartiers, pièces, type de logement, disponibilité\n\n' +
            '**✨ Critères Confort** (Bonus)\n' +
            '• Balcon, dernier étage, calme, meublé, parking, ascenseur\n\n' +
            '💡 Plus tu es précis, meilleurs sont les résultats !';
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard()
                .text('📋 Voir mes critères', 'view_criteria').row()
                .text('🔄 Modifier', 'start_onboarding').text('◀️ Retour', 'help')
        });
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery('help_alerts', async (ctx) => {
        const message =
            '🔔 **Comment Fonctionnent les Alertes**\n\n' +
            'Chaque annonce reçoit un score basé sur tes critères stricts et de confort.\n' +
            'Tu ne verras jamais deux fois la même annonce. ✅\n\n' +
            'Les alertes arrivent en moins de 5 minutes après publication. ⚡️';
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard().text('📋 Mes critères', 'view_criteria').text('◀️ Retour', 'help')
        });
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery('help_manage', async (ctx) => {
        if (!ctx.from?.id) return;
        const user = await userRepository.getUser(ctx.from.id);
        const pauseStatus = user?.is_paused ? '⏸️ En pause' : '▶️ Actives';
        const message =
            `⚙️ **Gérer Ton Compte**\n\n**Statut actuel** : ${pauseStatus}\n\n` +
            '• **Modifier mes critères** : Fais /start\n' +
            '• **Pause/Reprise** : Suspends temporairement les alertes';
        const kb = new InlineKeyboard()
            .text('📋 Voir critères', 'view_criteria').text('🔄 Modifier', 'start_onboarding').row();
        kb.text(user?.is_paused ? '▶️ Réactiver' : '⏸️ Mettre en pause', 'toggle_pause').row();
        kb.text('◀️ Retour', 'help');
        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: kb });
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery('help_how_it_works', async (ctx) => {
        const message =
            '🤖 **Comment Fonctionne FlattyBot**\n\n' +
            '1️⃣ Tu décris ta recherche\n' +
            '2️⃣ Mon IA analyse et extrait tes critères\n' +
            '3️⃣ Je scanne en permanence les nouvelles annonces\n' +
            '4️⃣ Tu reçois les meilleures offres en moins de 5 minutes ⚡️';
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            reply_markup: new InlineKeyboard().text('🚀 Commencer', 'start_onboarding').row().text('◀️ Retour', 'help')
        });
        await ctx.answerCallbackQuery();
    });

    // ── Authorization system (admin) ────────────────────────────────────────

    bot.callbackQuery(/^approve_user_(\d+)$/, async (ctx) => {
        const match = ctx.callbackQuery.data.match(/^approve_user_(\d+)$/);
        if (!match) return;
        const userId = parseInt(match[1]);
        const success = await userRepository.authorizeUser(userId);
        if (success) {
            await ctx.editMessageText(
                `✅ **Utilisateur approuvé**\n\n\`${userId}\` est autorisé.`,
                { parse_mode: 'Markdown' }
            );
            const pendingMsgId = pendingMessages.get(userId);
            if (pendingMsgId) {
                try {
                    await bot.api.editMessageText(userId, pendingMsgId, '✅ _Demande approuvée._', { parse_mode: 'Markdown' });
                    pendingMessages.delete(userId);
                } catch { /* best-effort */ }
            }
            try {
                await bot.api.sendMessage(
                    userId,
                    '🎉 **Ton accès a été validé !**\n\nFais /start pour configurer tes critères de recherche. 🚀',
                    { parse_mode: 'Markdown' }
                );
            } catch (e) { console.error('Error notifying approved user:', e); }
        } else {
            await ctx.reply('❌ Erreur lors de l\'autorisation.');
        }
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery(/^reject_user_(\d+)$/, async (ctx) => {
        const match = ctx.callbackQuery.data.match(/^reject_user_(\d+)$/);
        if (!match) return;
        const userId = parseInt(match[1]);
        const { error } = await supabase.from('users').delete().eq('telegram_id', userId);
        if (!error) {
            await ctx.editMessageText(
                `❌ **Utilisateur rejeté**\n\n\`${userId}\` supprimé.`,
                { parse_mode: 'Markdown' }
            );
            try {
                await bot.api.sendMessage(userId, '❌ **Demande d\'accès refusée.**', { parse_mode: 'Markdown' });
            } catch (e) { console.error('Error notifying rejected user:', e); }
        } else {
            await ctx.reply('❌ Erreur lors du rejet.');
        }
        await ctx.answerCallbackQuery();
    });
}
