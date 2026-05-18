import { InlineKeyboard } from 'grammy';
import { MyContext, SessionData } from '../context';
import { ExtractedCriteria, OpenAIService } from '../../services/openai.service';
import { UserRepository } from '../../repositories/user.repository';
import { LocationRepository } from '../../repositories/LocationRepository';
import { ProximityGraph } from '../../repositories/ProximityGraph';
import { MarketCheckService } from '../../services/market-check.service';
import { PollingService } from '../../services/poller';
import { formatCriteriaSummary, formatRooms } from '../../utils/formatting';
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

        lines.push(`🏠 ${typeLabel}`);
    }

    const roomsStr = formatRooms(cs.nombre_pieces_min ?? null, cs.nombre_pieces_max ?? null, l === 'en');
    if (roomsStr) lines.push(`🛏 ${roomsStr}`);

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

function recomputeMissing(criteria: ExtractedCriteria, session: SessionData): string[] {
    const cs = criteria.criteres_stricts;
    const missing: string[] = [];
    if (cs.budget_max === null && !session.skipBudgetAsk) missing.push('budget');
    if (cs.nombre_pieces_min === null && cs.nombre_pieces_max === null && !session.skipPiecesAsk) missing.push('pièces');
    if (cs.disponibilite === null && !session.skipAvailAsk) missing.push('disponibilité');
    return missing;
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
    ctx.session.skipBudgetAsk = undefined;
    ctx.session.skipPiecesAsk = undefined;
    ctx.session.skipAvailAsk = undefined;

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

        // Capture previous criteria before overwriting so we can restore dropped fields
        const previousCriteria = ctx.session.existingCriteria ?? ctx.session.tempCriteria;
        ctx.session.tempCriteria = criteria;

        // OpenAI sometimes drops fields not mentioned in the new message — restore them unless user explicitly skipped
        if (previousCriteria) {
            const cs = criteria.criteres_stricts;
            const pcs = previousCriteria.criteres_stricts;
            if (cs.budget_max === null && !ctx.session.skipBudgetAsk && pcs.budget_max != null)
                cs.budget_max = pcs.budget_max;
            if (cs.disponibilite === null && !ctx.session.skipAvailAsk && pcs.disponibilite != null)
                cs.disponibilite = pcs.disponibilite;
            if (cs.nombre_pieces_min === null && cs.nombre_pieces_max === null && !ctx.session.skipPiecesAsk
                && (pcs.nombre_pieces_min != null || pcs.nombre_pieces_max != null)) {
                cs.nombre_pieces_min = pcs.nombre_pieces_min;
                cs.nombre_pieces_max = pcs.nombre_pieces_max;
            }
        }

        criteria.criteres_manquants = recomputeMissing(criteria, ctx.session);

        await ctx.api.editMessageText(ctx.chat!.id, analyzeMsg.message_id, buildComprehensionSummary(criteria, l), { parse_mode: 'Markdown' });

        const hasMissing = criteria.criteres_manquants && criteria.criteres_manquants.length > 0;

        if (hasMissing) {
            if ((ctx.session.extractionRounds ?? 0) >= 4) {
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
    const cs = criteria.criteres_stricts;

    let question: string;
    let kb: InlineKeyboard;

    if (cs.budget_max === null && !ctx.session.skipBudgetAsk) {
        question = t(l, 'q_budget');
        kb = new InlineKeyboard()
            .text('< 1 500', 'qf_budget_1500').text('1 500–2 000', 'qf_budget_2000').row()
            .text('2 000–2 500', 'qf_budget_2500').text('2 500–3 000', 'qf_budget_3000').row()
            .text('3 000–3 500', 'qf_budget_3500').row()
            .text(t(l, 'cancel_btn'), 'cancel_onboarding');
    } else if (cs.nombre_pieces_min === null && cs.nombre_pieces_max === null && !ctx.session.skipPiecesAsk) {
        question = t(l, 'q_pieces');
        kb = new InlineKeyboard()
            .text('Studio / 1p', 'qf_pieces_1').text('2 pièces', 'qf_pieces_2').row()
            .text('3 pièces', 'qf_pieces_3').text('4 pièces +', 'qf_pieces_4').row()
            .text(t(l, 'pieces_any'), 'qf_pieces_any').row()
            .text(t(l, 'cancel_btn'), 'cancel_onboarding');
    } else if (cs.disponibilite === null && !ctx.session.skipAvailAsk) {
        question = t(l, 'q_avail');
        kb = new InlineKeyboard()
            .text(t(l, 'avail_asap'), 'qf_avail_asap').row()
            .text(t(l, 'avail_1m'), 'qf_avail_1m').text(t(l, 'avail_2m'), 'qf_avail_2m').row()
            .text(t(l, 'avail_flexible'), 'qf_avail_flexible').row()
            .text(t(l, 'cancel_btn'), 'cancel_onboarding');
    } else {
        question = criteria.question_followup
            ? t(l, 'ask_missing', criteria.question_followup)
            : t(l, 'ask_missing_fallback', criteria.criteres_manquants.map(c => `• ${c}`).join('\n'));
        kb = new InlineKeyboard().text(t(l, 'cancel_btn'), 'cancel_onboarding');
    }

    const round = ctx.session.extractionRounds ?? 1;
    const remaining = 4 - round;
    const hint = remaining > 0
        ? `\n\n_${l === 'en' ? `(max. ${remaining} more question${remaining > 1 ? 's' : ''})` : `(encore max. ${remaining} question${remaining > 1 ? 's' : ''})`}_`
        : '';

    await ctx.reply(question + hint, { parse_mode: 'Markdown', reply_markup: kb });
}

export async function proceedAfterQuickFill(ctx: MyContext) {
    if (!ctx.session.tempCriteria) return;
    const criteria = ctx.session.tempCriteria;
    const l = lang(ctx);
    criteria.criteres_manquants = recomputeMissing(criteria, ctx.session);
    const hasMissing = criteria.criteres_manquants.length > 0;

    if (hasMissing) {
        if ((ctx.session.extractionRounds ?? 0) >= 4) {
            await enterFallbackStep(ctx);
        } else {
            await enterAskMissingStep(ctx, criteria);
        }
        return;
    }

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
            ctx.session.step = 'ONBOARDING_WAITING_LOCATION_CLARIFICATION';
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
    if (!ctx.from?.id || !ctx.session.tempCriteria) return;
    await userRepository.saveCriteria(buildTempUserCriteria(ctx));
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
    ctx.session.skipBudgetAsk = undefined;
    ctx.session.skipPiecesAsk = undefined;
    ctx.session.skipAvailAsk = undefined;

    await bot.api.sendMessage(userId, t(l, 'final_msg') + criteriaText, { parse_mode: 'Markdown' });
}
