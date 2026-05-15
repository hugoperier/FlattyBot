import { InlineKeyboard } from 'grammy';
import { MyContext } from '../context';
import { ExtractedCriteria, OpenAIService } from '../../services/openai.service';
import { UserRepository } from '../../repositories/user.repository';
import { LocationRepository } from '../../repositories/LocationRepository';
import { ProximityGraph } from '../../repositories/ProximityGraph';
import { MarketCheckService } from '../../services/market-check.service';
import { PollingService } from '../../services/poller';
import { formatCriteriaSummary } from '../../utils/formatting';
import { t, Lang } from '../../i18n/strings';
import { UserCriteria } from '../../types/database';
import { bot } from '../index';

const openaiService = new OpenAIService();
const userRepository = new UserRepository();
const locationRepository = new LocationRepository();
const proximityGraph = new ProximityGraph();
const marketCheckService = new MarketCheckService();
const pollingService = new PollingService();

function lang(ctx: MyContext): Lang {
    return ctx.session.language ?? 'fr';
}

function buildComprehensionSummary(criteria: ExtractedCriteria, l: Lang): string {
    const cs = criteria.criteres_stricts;
    const lines: string[] = [];

    if (cs.type_logement && cs.type_logement.length > 0) {
        const hasColoc = cs.type_logement.some(s => s.includes('coloc') || s.includes('chambre'));
        const hasAppart = cs.type_logement.some(s => s.includes('appart') || s.includes('studio') || s.includes('maison') || s.includes('duplex') || s.includes('loft'));
        let typeLabel = '';
        if (hasAppart && !hasColoc) typeLabel = l === 'en' ? 'Apartment' : 'Appartement';
        else if (hasColoc && !hasAppart) typeLabel = l === 'en' ? 'Flatshare / Room' : 'Colocation / Chambre';
        else typeLabel = l === 'en' ? 'Apartment or Flatshare' : 'Appartement ou Colocation';

        const pieces = cs.nombre_pieces_min ?? cs.nombre_pieces_max;
        if (pieces) typeLabel += l === 'en' ? ` · ${pieces}+ rooms` : ` · ${pieces}+ pièces`;
        lines.push(`🏠 ${typeLabel}`);
    }

    if (cs.zones && cs.zones.length > 0) {
        lines.push(`📍 ${cs.zones.join(', ')}`);
    }

    if (cs.budget_max) {
        lines.push(`💰 Max ${cs.budget_max.toLocaleString('fr-CH')} CHF/mois`);
    }

    if (cs.disponibilite) {
        lines.push(`📅 ${cs.disponibilite}`);
    }

    if (lines.length === 0) return l === 'en' ? '📝 _Processing your request…_' : '📝 _Traitement en cours…_';

    const header = l === 'en' ? "📝 **Here's what I understood:**" : '📝 **Voici ce que j\'ai compris :**';
    return `${header}\n${lines.join('\n')}`;
}

function determineHousingType(types: string[]): 'appartement' | 'colocation' | 'unknown' {
    if (!types || types.length === 0) return 'unknown';
    const lowered = types.map(s => s.toLowerCase());
    const hasAppart = lowered.some(s => s.includes('appart') || s.includes('studio') || s.includes('maison') || s.includes('duplex') || s.includes('loft'));
    const hasColoc = lowered.some(s => s.includes('coloc') || s.includes('chambre'));
    if (hasAppart && !hasColoc) return 'appartement';
    if (hasColoc && !hasAppart) return 'colocation';
    return 'unknown';
}

export async function enterLanguageStep(ctx: MyContext) {
    ctx.session.step = 'ONBOARDING_LANGUAGE';
    const kb = new InlineKeyboard()
        .text(t('fr', 'lang_fr'), 'lang_fr').row()
        .text(t('fr', 'lang_en'), 'lang_en');
    await ctx.reply(t('fr', 'lang_prompt'), { parse_mode: 'Markdown', reply_markup: kb });
}

export async function enterWelcomeStep(ctx: MyContext) {
    const l = lang(ctx);
    ctx.session.step = 'ONBOARDING_WAITING_DESCRIPTION';
    ctx.session.extractionRounds = 0;
    ctx.session.conversationHistory = [];
    ctx.session.originalDescription = undefined;
    ctx.session.tempCriteria = undefined;

    const existingCriteria = await userRepository.getCriteria(ctx.from!.id);
    if (existingCriteria) {
        ctx.session.existingCriteria = {
            criteres_stricts: existingCriteria.criteres_stricts,
            criteres_confort: existingCriteria.criteres_confort,
            criteres_manquants: [],
            question_followup: null,
            confiance: existingCriteria.confiance_extraction,
            resume_humain: existingCriteria.resume_humain
        };
        const kb = new InlineKeyboard().text(t(l, 'cancel_btn'), 'cancel_onboarding');
        await ctx.reply(t(l, 'welcome_update'), { parse_mode: 'Markdown', reply_markup: kb });
    } else {
        ctx.session.existingCriteria = undefined;
        const example = t(l, 'welcome_example');
        const kb = new InlineKeyboard().text(t(l, 'cancel_btn'), 'cancel_onboarding');
        await ctx.reply(t(l, 'welcome_new', example), { parse_mode: 'Markdown', reply_markup: kb });
    }
}

/**
 * Core extraction round. Handles both ONBOARDING_WAITING_DESCRIPTION and
 * ONBOARDING_ASKING_MISSING text inputs.
 */
export async function runExtractionRound(ctx: MyContext, description: string) {
    const l = lang(ctx);

    if (!ctx.session.conversationHistory) ctx.session.conversationHistory = [];
    ctx.session.conversationHistory.push({
        role: 'user',
        content: description,
        timestamp: new Date().toISOString()
    });

    if (!ctx.session.originalDescription) {
        ctx.session.originalDescription = description;
    }

    const analyzeMsg = await ctx.reply(t(l, 'analyzing'));

    try {
        const criteria = await openaiService.extractCriteria(description, {
            conversationHistory: ctx.session.conversationHistory,
            existingCriteria: ctx.session.existingCriteria ?? ctx.session.tempCriteria,
            lang: l
        });

        ctx.session.extractionRounds = (ctx.session.extractionRounds ?? 0) + 1;
        ctx.session.tempCriteria = criteria;

        await ctx.api.editMessageText(ctx.chat!.id, analyzeMsg.message_id, buildComprehensionSummary(criteria, l), { parse_mode: 'Markdown' });

        const hasMissing = criteria.criteres_manquants && criteria.criteres_manquants.length > 0;

        if (hasMissing) {
            if ((ctx.session.extractionRounds ?? 0) >= 3) {
                await enterFallbackStep(ctx);
            } else {
                await enterAskMissingStep(ctx, criteria);
            }
            return;
        }

        // All criteria present — disambiguate housing type if needed
        const housingType = determineHousingType(criteria.criteres_stricts?.type_logement || []);
        if (housingType === 'appartement') {
            criteria.criteres_stricts.type_logement = ['appartement', 'studio', 'maison', 'duplex', 'loft'];
            await enterRecapStep(ctx);
        } else if (housingType === 'colocation') {
            criteria.criteres_stricts.type_logement = ['colocation', 'chambre', 'chambre partagée'];
            await enterRecapStep(ctx);
        } else {
            ctx.session.step = 'ONBOARDING_WAITING_TYPE_LOGEMENT';
            const kb = new InlineKeyboard()
                .text(t(l, 'housing_appart'), 'type_appart').row()
                .text(t(l, 'housing_coloc'), 'type_coloc').row()
                .text(t(l, 'housing_all'), 'type_all').row()
                .text(t(l, 'cancel_btn'), 'cancel_onboarding');
            await ctx.reply(t(l, 'housing_question'), { parse_mode: 'Markdown', reply_markup: kb });
        }
    } catch {
        const errMsg = l === 'en'
            ? '⚠️ Something went wrong. Please try again.'
            : '⚠️ Oups, j\'ai eu un souci. Peux-tu réessayer ?';
        await ctx.api.editMessageText(ctx.chat!.id, analyzeMsg.message_id, errMsg).catch(() => ctx.reply(errMsg));
    }
}

async function enterAskMissingStep(ctx: MyContext, criteria: ExtractedCriteria) {
    const l = lang(ctx);
    ctx.session.step = 'ONBOARDING_ASKING_MISSING';

    const question = criteria.question_followup
        ? t(l, 'ask_missing', criteria.question_followup)
        : t(l, 'ask_missing_fallback', criteria.criteres_manquants.map(c => `• ${c}`).join('\n'));

    const kb = new InlineKeyboard().text(t(l, 'cancel_btn'), 'cancel_onboarding');
    await ctx.reply(question, { parse_mode: 'Markdown', reply_markup: kb });
}

async function enterFallbackStep(ctx: MyContext) {
    const l = lang(ctx);
    ctx.session.step = 'ONBOARDING_FALLBACK';
    const kb = new InlineKeyboard()
        .text(t(l, 'fallback_continue_btn'), 'fallback_continue').row()
        .text(t(l, 'fallback_restart_btn'), 'fallback_restart');
    await ctx.reply(t(l, 'fallback_msg'), { parse_mode: 'Markdown', reply_markup: kb });
}

export async function enterRecapStep(ctx: MyContext) {
    const l = lang(ctx);
    if (!ctx.session.tempCriteria) return;

    ctx.session.step = 'ONBOARDING_WAITING_CONFIRMATION';
    const summary = formatCriteriaSummary(ctx.session.tempCriteria, l);
    ctx.session.conversationHistory?.push({
        role: 'assistant',
        content: summary,
        timestamp: new Date().toISOString()
    });

    const kb = new InlineKeyboard()
        .text(t(l, 'recap_confirm_btn'), 'confirm_criteria').row()
        .text(t(l, 'recap_modify_btn'), 'modify_criteria')
        .text(t(l, 'recap_restart_btn'), 'restart_onboarding');

    await ctx.reply(summary, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function enterRecapStepEdit(ctx: MyContext) {
    const l = lang(ctx);
    if (!ctx.session.tempCriteria) return;

    ctx.session.step = 'ONBOARDING_WAITING_CONFIRMATION';
    const summary = formatCriteriaSummary(ctx.session.tempCriteria, l);

    const kb = new InlineKeyboard()
        .text(t(l, 'recap_confirm_btn'), 'confirm_criteria').row()
        .text(t(l, 'recap_modify_btn'), 'modify_criteria')
        .text(t(l, 'recap_restart_btn'), 'restart_onboarding');

    await ctx.editMessageText(summary, { parse_mode: 'Markdown', reply_markup: kb });
}

/**
 * Location suggestion step — triggered by confirm_criteria callback.
 * Canonicalizes zones, computes proximity suggestions, then proceeds to market check.
 */
export async function enterLocationStep(ctx: MyContext) {
    const l = lang(ctx);
    if (!ctx.session.tempCriteria) return;

    const extractedZones = ctx.session.tempCriteria.criteres_stricts?.zones || [];

    if (extractedZones.length > 0) {
        const verifiedZones: string[] = [];
        const unknownZones: string[] = [];

        for (const z of extractedZones) {
            const matches = locationRepository.findCanonical(z);
            if (matches.length > 0) {
                verifiedZones.push(matches[0]);
            } else {
                unknownZones.push(z);
            }
        }

        if (unknownZones.length > 0) {
            await ctx.reply(t(l, 'loc_unknown', unknownZones.join(', ')), { parse_mode: 'Markdown' });
            return;
        }

        ctx.session.tempCriteria.criteres_stricts.zones = verifiedZones;
        ctx.session.verifiedZones = verifiedZones;

        const suggestions = new Set<string>();
        for (const z of verifiedZones) {
            proximityGraph.getNeighbors(z).forEach((n: string) => {
                if (!verifiedZones.includes(n)) suggestions.add(n);
            });
        }
        ctx.session.suggestedZones = Array.from(suggestions);

        if (suggestions.size > 0) {
            ctx.session.step = 'ONBOARDING_WAITING_LOCATION_VALIDATION';
            const msg =
                `📍 **${l === 'en' ? 'Location' : 'Localisation'}**\n\n` +
                `${t(l, 'loc_verified', verifiedZones.join(', '))}\n\n` +
                `${t(l, 'loc_suggestion', Array.from(suggestions).join(', '))}`;
            const kb = new InlineKeyboard()
                .text(t(l, 'loc_all_btn'), 'conf_loc_all').row()
                .text(t(l, 'loc_strict_btn'), 'conf_loc_strict').row()
                .text(t(l, 'loc_modify_btn'), 'modify_criteria');
            await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });
            return;
        }
    }

    // No zones or no neighbors → skip to market check
    await runMarketCheck(ctx);
}

function buildTempUserCriteria(ctx: MyContext): UserCriteria {
    return {
        user_id: ctx.from!.id,
        criteres_stricts: ctx.session.tempCriteria!.criteres_stricts,
        criteres_confort: ctx.session.tempCriteria!.criteres_confort,
        description_originale: ctx.session.originalDescription ?? '',
        resume_humain: ctx.session.tempCriteria!.resume_humain,
        confiance_extraction: ctx.session.tempCriteria!.confiance,
        updated_at: new Date().toISOString()
    };
}

export async function runMarketCheck(ctx: MyContext) {
    const l = lang(ctx);
    if (!ctx.session.tempCriteria || !ctx.from?.id) return;

    await ctx.reply(t(l, 'market_checking'));

    const tempCriteria = buildTempUserCriteria(ctx);
    const { total } = await marketCheckService.countMatchesOverWindow(tempCriteria, 336);

    // Persist criteria so runCatchup can load them
    await userRepository.saveCriteria(tempCriteria);

    if (total === 0 || total < 5) {
        ctx.session.step = 'ONBOARDING_WAITING_MARKET_DECISION';
        const kb = new InlineKeyboard()
            .text(t(l, 'market_continue_btn'), 'market_continue').row()
            .text(t(l, 'market_modify_btn'), 'modify_criteria');
        const msg = total === 0 ? t(l, 'market_empty') : t(l, 'market_low', total);
        await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb });
        // stop — wait for user decision
    } else {
        await ctx.reply(t(l, 'market_good', total), { parse_mode: 'Markdown' });
        await runPreview(ctx);
    }
}

export async function runPreview(ctx: MyContext) {
    if (!ctx.from?.id) return;
    // runCatchup sends its own header + alerts, then we show the final message
    await pollingService.runCatchup(ctx.from.id);
    await enterFinalStep(ctx);
}

async function enterFinalStep(ctx: MyContext) {
    const l = lang(ctx);
    const userId = ctx.from!.id;
    const criteriaText = ctx.session.tempCriteria
        ? '\n\n' + buildComprehensionSummary(ctx.session.tempCriteria, l)
        : '';

    ctx.session.step = 'IDLE';
    ctx.session.tempCriteria = undefined;
    ctx.session.conversationHistory = undefined;
    ctx.session.existingCriteria = undefined;
    ctx.session.extractionRounds = undefined;
    ctx.session.originalDescription = undefined;
    ctx.session.verifiedZones = undefined;
    ctx.session.suggestedZones = undefined;

    await bot.api.sendMessage(userId, t(l, 'final_msg') + criteriaText, { parse_mode: 'Markdown' });
}
