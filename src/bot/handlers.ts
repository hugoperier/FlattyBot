import { Bot, InlineKeyboard } from 'grammy';
import { MyContext } from './context';
import { OpenAIService } from '../services/openai.service';
import { UserRepository } from '../repositories/user.repository';
import { AlertRepository } from '../repositories/alert.repository';
import { formatCriteriaSummary } from '../utils/formatting';
import { supabase } from '../config/supabase';

const openaiService = new OpenAIService();
const userRepository = new UserRepository();
const alertRepository = new AlertRepository();

export function setupHandlers(bot: Bot<MyContext>) {

    // /start
    bot.command('start', async (ctx) => {
        ctx.session.step = 'ONBOARDING_WAITING_DESCRIPTION';

        // Initialize conversation history
        ctx.session.conversationHistory = [];

        // Load existing criteria if user already has some
        if (ctx.from?.id) {
            const existingCriteria = await userRepository.getCriteria(ctx.from.id);
            if (existingCriteria) {
                // Convert DB format to ExtractedCriteria format
                ctx.session.existingCriteria = {
                    criteres_stricts: existingCriteria.criteres_stricts,
                    criteres_confort: existingCriteria.criteres_confort,
                    criteres_manquants: [],
                    confiance: existingCriteria.confiance_extraction,
                    resume_humain: existingCriteria.resume_humain
                };
            }
        }

        const keyboard = new InlineKeyboard()
            .text("❌ Annuler", "cancel_onboarding");

        const message = ctx.session.existingCriteria
            ? "🔄 **Modification de tes critères**\n\n" +
            "Tu as déjà des critères définis. Dis-moi ce que tu veux changer ou reformule entièrement ta recherche.\n\n" +
            "Exemples :\n" +
            "• \"Je veux monter mon budget à 2800 CHF\"\n" +
            "• \"J'aimerais aussi un balcon\"\n" +
            "• \"Finalement je cherche plutôt à Plainpalais\""
            : "👋 Salut ! Je suis FlattyBot.\n\n" +
            "Je vais t'aider à trouver l'appartement idéal à Genève. 🏠\n\n" +
            "Dis-moi ce que tu cherches en quelques phrases.\n" +
            "Exemple : *'Je cherche un 3 pièces à Carouge ou Plainpalais, max 2500 CHF. J'aimerais un balcon et si possible le dernier étage.'*";

        await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: keyboard });
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

            // Add user message to conversation history
            if (!ctx.session.conversationHistory) {
                ctx.session.conversationHistory = [];
            }
            ctx.session.conversationHistory.push({
                role: 'user',
                content: description,
                timestamp: new Date().toISOString()
            });

            await ctx.reply("🔍 J'analyse ta demande... (ça prend quelques secondes)");

            try {
                // Extract criteria with context
                const criteria = await openaiService.extractCriteria(description, {
                    conversationHistory: ctx.session.conversationHistory,
                    existingCriteria: ctx.session.existingCriteria
                });

                ctx.session.tempCriteria = criteria;
                ctx.session.step = 'ONBOARDING_WAITING_CONFIRMATION';

                const summary = formatCriteriaSummary(criteria);

                // Add assistant response to conversation history
                ctx.session.conversationHistory.push({
                    role: 'assistant',
                    content: summary,
                    timestamp: new Date().toISOString()
                });

                const keyboard = new InlineKeyboard()
                    .text("✅ C'est tout bon !", "confirm_criteria").row()
                    .text("🔄 Reformuler", "retry_criteria")
                    .text("❌ Annuler", "cancel_onboarding");

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
            ctx.session.conversationHistory = undefined;
            ctx.session.existingCriteria = undefined;

            await ctx.editMessageText("✅ Critères enregistrés ! Je commence à chercher pour toi. 🚀");
            await ctx.answerCallbackQuery();
        }
    });

    bot.callbackQuery('retry_criteria', async (ctx) => {
        ctx.session.step = 'ONBOARDING_WAITING_DESCRIPTION';

        const keyboard = new InlineKeyboard()
            .text("❌ Annuler", "cancel_onboarding");

        await ctx.reply(
            "Pas de souci. Dis-moi à nouveau ce que tu cherches (tu peux être plus précis).",
            { reply_markup: keyboard }
        );
        await ctx.answerCallbackQuery();
    });

    bot.callbackQuery('cancel_onboarding', async (ctx) => {
        // Reset session state
        ctx.session.step = 'IDLE';
        ctx.session.tempCriteria = undefined;
        ctx.session.conversationHistory = undefined;
        ctx.session.existingCriteria = undefined;

        await ctx.editMessageText(
            "❌ Onboarding annulé.\n\n" +
            "Pas de problème ! Tu peux reprendre quand tu veux avec /start ou /menu. 👍"
        );
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

    bot.callbackQuery('view_alerts', async (ctx) => {
        if (!ctx.from?.id) return;

        const alerts = await alertRepository.getUserAlerts(ctx.from.id, 10);

        if (alerts.length === 0) {
            await ctx.reply("Tu n'as encore reçu aucune alerte. 📭\n\nJe te préviendrai dès qu'une annonce correspondant à tes critères sera publiée ! 🔔");
            await ctx.answerCallbackQuery();
            return;
        }

        // Get ad details for each alert
        const alertsWithDetails = await Promise.all(
            alerts.map(async (alert) => {
                const { data: ad } = await supabase
                    .from('fb_annonces_location')
                    .select(`
                        *,
                        facebook_posts (
                            post_id,
                            time_posted,
                            input_data
                        )
                    `)
                    .eq('id', alert.annonce_id)
                    .single();
                return { alert, ad };
            })
        );

        let message = `🔔 **Tes ${alerts.length} dernières alertes**\n\n`;

        alertsWithDetails.forEach(({ alert, ad }, index) => {
            if (!ad) return;

            const type = ad.type_logement || 'Logement';
            const pieces = ad.nombre_pieces
                ? `${ad.nombre_pieces} pièce${ad.nombre_pieces > 1 ? 's' : ''}`
                : '';
            const prix = ad.loyer_total ? `${ad.loyer_total} CHF` : 'Prix à discuter';
            const quartier = ad.quartier || ad.ville || 'Genève';

            message += `**${index + 1}.** ${type}${pieces ? ` - ${pieces}` : ''}\n`;
            message += `📍 ${quartier} • 💰 ${prix}\n`;
            message += `⭐️ Score: ${alert.score_total}/100`;
            if (alert.badges.length > 0) {
                message += ` ${alert.badges.join(' ')}`;
            }
            message += `\n\n`;
        });

        message += `💡 *Utilise /menu pour voir toutes les options*`;

        await ctx.reply(message, { parse_mode: 'Markdown' });
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

    // === HELP SYSTEM ===

    // Main help callback - contextual based on user status
    bot.callbackQuery('help', async (ctx) => {
        if (!ctx.from?.id) return;

        const user = await userRepository.getUser(ctx.from.id);
        const criteria = await userRepository.getCriteria(ctx.from.id);

        let message = "❓ **Aide FlattyBot**\n\n";
        const keyboard = new InlineKeyboard();

        // Contextual message based on user state
        if (!criteria) {
            // New user or incomplete onboarding
            message += "👋 Bienvenue ! Tu n'as pas encore configuré tes critères de recherche.\n\n";
            message += "Fais /start pour commencer et décrire ce que tu cherches ! 🚀\n\n";
            message += "Une fois tes critères définis, je te préviendrai automatiquement des meilleures offres. 🏠";

            keyboard
                .text("🚀 Commencer", "start_onboarding").row()
                .text("📚 En savoir plus", "help_how_it_works");
        } else {
            // Active user with criteria
            if (user?.is_paused) {
                message += "⚠️ **Tes alertes sont actuellement en pause.**\n\n";
                keyboard.text("▶️ Réactiver les alertes", "toggle_pause").row();
            } else {
                message += "✅ Tu es bien configuré et je cherche activement pour toi ! 🎯\n\n";
            }

            message += "Voici ce que tu peux faire :";

            keyboard
                .text("📚 Commandes", "help_commands")
                .text("🔍 Critères", "help_criteria").row()
                .text("🔔 Alertes", "help_alerts")
                .text("⚙️ Gestion", "help_manage").row()
                .text("🏠 Menu Principal", "back_to_menu");
        }

        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        await ctx.answerCallbackQuery();
    });

    // Sub-menu: Commands
    bot.callbackQuery('help_commands', async (ctx) => {
        const message =
            "📚 **Commandes Disponibles**\n\n" +
            "**Configuration**\n" +
            "• `/start` - Configurer ou modifier tes critères de recherche\n" +
            "• `/menu` - Accéder au menu principal\n\n" +
            "**Gestion des Alertes**\n" +
            "• `/pause` - Mettre en pause les alertes\n" +
            "• `/resume` - Réactiver les alertes\n\n" +
            "**Navigation**\n" +
            "• Tu peux aussi utiliser les boutons interactifs dans le menu ! 🎯";

        const keyboard = new InlineKeyboard()
            .text("◀️ Retour", "help")
            .text("🏠 Menu", "back_to_menu");

        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        await ctx.answerCallbackQuery();
    });

    // Sub-menu: Criteria explanation
    bot.callbackQuery('help_criteria', async (ctx) => {
        const message =
            "🔍 **Comprendre les Critères**\n\n" +
            "J'analyse ta description pour identifier 2 types de critères :\n\n" +
            "**🔒 Critères Stricts** (Deal-breakers)\n" +
            "• Budget maximum\n" +
            "• Zones/quartiers souhaités\n" +
            "• Nombre de pièces\n" +
            "• Type de logement\n" +
            "• Date de disponibilité\n\n" +
            "_Si une annonce ne respecte pas ces critères, elle est automatiquement éliminée. ❌_\n\n" +
            "**✨ Critères Confort** (Bonus)\n" +
            "• Dernier étage ☀️\n" +
            "• Balcon/Terrasse 🌿\n" +
            "• Calme 🤫\n" +
            "• Meublé 🛋️\n" +
            "• Parking 🚗\n" +
            "• Ascenseur 🛗\n\n" +
            "_Ces critères donnent des points bonus mais ne sont pas éliminatoires. 🌟_\n\n" +
            "💡 **Astuce** : Plus tu es précis dans ta description, meilleurs sont les résultats !";

        const keyboard = new InlineKeyboard()
            .text("📋 Voir mes critères", "view_criteria").row()
            .text("🔄 Modifier", "start_onboarding")
            .text("◀️ Retour", "help");

        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        await ctx.answerCallbackQuery();
    });

    // Sub-menu: Alerts explanation
    bot.callbackQuery('help_alerts', async (ctx) => {
        const message =
            "🔔 **Comment Fonctionnent les Alertes**\n\n" +
            "**🎯 Système de Scoring**\n" +
            "Chaque annonce reçoit un score sur 100 :\n" +
            "• 60 points max pour les critères stricts\n" +
            "• 40 points max pour les critères confort\n\n" +
            "**📊 Seuils d'Envoi**\n" +
            "• Score ≥ 70 : Tu reçois l'alerte ! 🎉\n" +
            "• Score < 70 : Annonce pas assez pertinente\n\n" +
            "**⚡️ Rapidité**\n" +
            "Les alertes sont envoyées moins de 5 minutes après publication de l'annonce.\n\n" +
            "**🏆 Badges Spéciaux**\n" +
            "• 🔥 **Hot** : Score ≥ 90 (match quasi-parfait)\n" +
            "• ⚡️ **Urgent** : Annonce marquée urgente\n" +
            "• 💎 **Premium** : Tous critères confort respectés\n\n" +
            "Tu ne verras jamais 2 fois la même annonce ! ✅";

        const keyboard = new InlineKeyboard()
            .text("📋 Mes critères", "view_criteria")
            .text("◀️ Retour", "help");

        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        await ctx.answerCallbackQuery();
    });

    // Sub-menu: Account management
    bot.callbackQuery('help_manage', async (ctx) => {
        if (!ctx.from?.id) return;
        const user = await userRepository.getUser(ctx.from.id);

        const pauseStatus = user?.is_paused ? "⏸️ En pause" : "▶️ Actives";

        const message =
            "⚙️ **Gérer Ton Compte**\n\n" +
            `**Statut actuel** : ${pauseStatus}\n\n` +
            "**Actions Disponibles**\n" +
            "• **Voir mes critères** : Consulte tes critères actuels\n" +
            "• **Modifier mes critères** : Change ta recherche à tout moment\n" +
            "• **Pause/Reprise** : Suspends temporairement les alertes\n\n" +
            "💡 **Comment modifier mes critères ?**\n" +
            "Fais simplement /start et redécris ta recherche. Tes anciens critères seront remplacés.\n\n" +
            "💡 **Quand mettre en pause ?**\n" +
            "Pendant les vacances, si tu as trouvé un logement, ou si tu veux faire une pause dans ta recherche.";

        const keyboard = new InlineKeyboard()
            .text("📋 Voir critères", "view_criteria")
            .text("🔄 Modifier", "start_onboarding").row();

        if (user?.is_paused) {
            keyboard.text("▶️ Réactiver", "toggle_pause");
        } else {
            keyboard.text("⏸️ Mettre en pause", "toggle_pause");
        }

        keyboard.row().text("◀️ Retour", "help");

        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        await ctx.answerCallbackQuery();
    });

    // For new users: how it works
    bot.callbackQuery('help_how_it_works', async (ctx) => {
        const message =
            "🤖 **Comment Fonctionne FlattyBot**\n\n" +
            "**1️⃣ Tu décris ta recherche** 💬\n" +
            "Dis-moi en quelques phrases ce que tu cherches (budget, zone, type d'appart, souhaits...)\n\n" +
            "**2️⃣ Je comprends tes besoins** 🧠\n" +
            "Mon IA analyse ta demande et identifie tes critères importants.\n\n" +
            "**3️⃣ Je surveille les annonces** 👀\n" +
            "Je scanne en permanence les nouvelles annonces de location à Genève.\n\n" +
            "**4️⃣ Tu reçois les meilleures offres** 🎯\n" +
            "Je te préviens uniquement pour les annonces qui correspondent vraiment à ta recherche (score ≥ 70/100).\n\n" +
            "**5️⃣ Tu es prévenu en temps réel** ⚡️\n" +
            "Moins de 5 minutes après publication, pour ne rien manquer !\n\n" +
            "Prêt à commencer ? 🚀";

        const keyboard = new InlineKeyboard()
            .text("🚀 Oui, on y va !", "start_onboarding").row()
            .text("◀️ Retour", "help");

        await ctx.editMessageText(message, { parse_mode: 'Markdown', reply_markup: keyboard });
        await ctx.answerCallbackQuery();
    });

    // Helper callback: start onboarding from help
    bot.callbackQuery('start_onboarding', async (ctx) => {
        ctx.session.step = 'ONBOARDING_WAITING_DESCRIPTION';

        const keyboard = new InlineKeyboard()
            .text("❌ Annuler", "cancel_onboarding");

        await ctx.editMessageText(
            "👋 Parfait ! Dis-moi ce que tu cherches en quelques phrases.\n\n" +
            "Exemple : *'Je cherche un 3 pièces à Carouge ou Plainpalais, max 2500 CHF. J'aimerais un balcon et si possible le dernier étage.'*",
            { parse_mode: 'Markdown', reply_markup: keyboard }
        );
        await ctx.answerCallbackQuery();
    });

    // Helper callback: back to main menu
    bot.callbackQuery('back_to_menu', async (ctx) => {
        const keyboard = new InlineKeyboard()
            .text("📋 Mes critères", "view_criteria")
            .text("🔔 Mes alertes", "view_alerts").row()
            .text("⏸️ Pause", "toggle_pause")
            .text("❓ Aide", "help");

        await ctx.editMessageText("Menu Principal", { reply_markup: keyboard });
        await ctx.answerCallbackQuery();
    });
}
