import { AdRepository } from '../repositories/ad.repository';
import { UserRepository } from '../repositories/user.repository';
import { AlertRepository } from '../repositories/alert.repository';
import { ScoreResult, ScoringService } from './scoring.service';
import { AlertFormatterService } from './alert-formatter.service';
import { bot } from '../bot';
import { AdWithPost, User, UserCriteria } from '../types/database';
import { AdAggregationService, AdContext } from './ad-aggregation.service';
import { INACTIVITY_TIMEOUT_MINUTES } from '../config/supabase';

export class PollingService {
    private adRepo: AdRepository;
    private userRepo: UserRepository;
    private alertRepo: AlertRepository;
    private scoringService: ScoringService;
    private adAggregationService: AdAggregationService;

    constructor() {
        this.adRepo = new AdRepository();
        this.userRepo = new UserRepository();
        this.alertRepo = new AlertRepository();
        this.scoringService = new ScoringService();
        this.adAggregationService = new AdAggregationService();
    }

    async startPolling(intervalMs: number = 3 * 60 * 1000) {
        console.log(`Starting polling service (interval: ${intervalMs}ms)...`);
        this.poll(); // Run immediately
        setInterval(() => this.poll(), intervalMs);

        // Inactivity check: run every hour
        const inactivityIntervalMs = 60 * 60 * 1000;
        this.checkInactiveUsers(); // Run immediately on startup
        setInterval(() => this.checkInactiveUsers(), inactivityIntervalMs);
    }

    private async checkInactiveUsers() {
        try {
            const count = await this.userRepo.deactivateInactiveUsers(INACTIVITY_TIMEOUT_MINUTES);
            if (count > 0) {
                console.log(`[Inactivity] ${count} user(s) deactivated and notified.`);
            }
        } catch (error) {
            console.error('[Inactivity] Error running inactivity check:', error);
        }
    }

    private async poll() {
        try {
            console.log('Polling for new ads...');
            const adContexts = await this.adAggregationService.getAdsForPolling(48); // Last 48h for FB, incremental for Agency
            const users = await this.userRepo.getAllActiveUsers();

            console.log(`Found ${adContexts.length} ads (all sources) and ${users.length} active users.`);

            for (const user of users) {
                await this.processUser(user, adContexts);
            }
        } catch (error) {
            console.error('Error in polling loop:', error);
        }
    }

    private async processUser(user: User, adContexts: AdContext[]) {
        const criteria = await this.userRepo.getCriteria(user.telegram_id);
        if (!criteria) return;

        for (const ctx of adContexts) {
            const scoringAd = ctx.scoringAd;
            const adId = ctx.source === 'facebook' ? ctx.facebookAd!.id : ctx.agencyAd!.id;

            // De-duplication for all sources
            const alreadySent = await this.alertRepo.hasAlertBeenSent(user.telegram_id, adId, ctx.source);
            if (alreadySent) continue;

            // Calculate score
            const scoreResult = this.scoringService.calculateScore(scoringAd, criteria);

            // Thresholds
            // If score > 0 (meaning strict criteria met), we consider sending
            // But maybe we want a minimum score? The prompt says:
            // "Critères stricts : doivent TOUS être respectés sinon score = 0 (pas d'alerte)"
            // So if score > 0, it's a match.

            if (scoreResult.score_total > 0) {
                await this.sendAlert(user.telegram_id, ctx, scoreResult);
            }
        }
    }

    private async sendAlert(userId: number, ctx: AdContext, score: ScoreResult) {
        try {
            const formatter = new AlertFormatterService();

            if (ctx.source === 'facebook' && ctx.facebookAd) {
                const ad = ctx.facebookAd;

                // Format the message
                const message = await formatter.formatFacebookAlertMessage(ad, score);

                // Check if we have a valid image
                const imageUrl = await formatter.getFacebookImageUrl(ad.image_path);

                if (imageUrl) {
                    // Send with image
                    await bot.api.sendPhoto(userId, imageUrl, {
                        caption: message,
                        parse_mode: 'Markdown'
                    });
                } else {
                    // Send text only
                    await bot.api.sendMessage(userId, message, {
                        parse_mode: 'Markdown'
                    });
                }

                console.log(`Alert sent to user ${userId} for Facebook ad ${ad.id}`);
            } else if (ctx.source === 'agency' && ctx.agencyAd) {
                const ad = ctx.agencyAd;

                const message = formatter.formatAgencyAlertMessage(ad, ctx.scoringAd, score);
                const imageUrl = formatter.getAgencyImageUrl(ad);

                if (imageUrl) {
                    await bot.api.sendPhoto(userId, imageUrl, {
                        caption: message,
                        parse_mode: 'Markdown'
                    });
                } else {
                    await bot.api.sendMessage(userId, message, {
                        parse_mode: 'Markdown'
                    });
                }

                console.log(`Alert sent to user ${userId} for Agency ad ${ad.id}`);
            }

            // Save alert for all sources
            await this.alertRepo.saveAlert({
                user_id: userId,
                annonce_id: ctx.source === 'facebook' ? ctx.facebookAd!.id : ctx.agencyAd!.id,
                source: ctx.source,
                score_total: score.score_total,
                score_criteres_stricts: score.score_criteres_stricts,
                score_criteres_confort: score.score_criteres_confort,
                criteres_stricts_matches: score.criteres_stricts_matches,
                criteres_confort_matches: score.criteres_confort_matches,
                badges: score.badges,
                user_action: 'SENT'
            });
        } catch (error) {
            console.error(`Failed to send alert to ${userId}:`, error);
        }
    }

    /**
     * Executes a one-off scan against the last 48h of ads for a specific user,
     * immediately after they update their criteria.
     */
    async runCatchup(userTelegramId: number) {
        const user = await this.userRepo.getUser(userTelegramId);
        const criteria = await this.userRepo.getCriteria(userTelegramId);
        if (!user || !criteria) return;

        console.log(`Running criteria catchup for user ${userTelegramId}...`);

        const adContexts = await this.adAggregationService.getRecentAdsForCatchup(48);
        console.log(`Catchup fetched ${adContexts.length} recent ads.`);

        const validMatches = [];

        for (const ctx of adContexts) {
            const scoringAd = ctx.scoringAd;
            const adId = ctx.source === 'facebook' ? ctx.facebookAd!.id : ctx.agencyAd!.id;

            const alreadySent = await this.alertRepo.hasAlertBeenSent(user.telegram_id, adId, ctx.source);
            if (alreadySent) continue;

            const scoreResult = this.scoringService.calculateScore(scoringAd, criteria);

            // We use the same matching threshold as the main loop (> 0 meaning strict criteria met)
            if (scoreResult.score_total > 0) {
                validMatches.push({ ctx, scoreResult });
            }
        }

        // Sort by score descending to get the best matches first
        validMatches.sort((a, b) => b.scoreResult.score_total - a.scoreResult.score_total);

        // Send top 5 to avoid spam
        const matchesToSend = validMatches.slice(0, 5);

        if (matchesToSend.length > 0) {
            await bot.api.sendMessage(
                userTelegramId,
                `🚀 **Rattrapage**\nJ'ai trouvé ${validMatches.length} annonce(s) récente(s) qui correspondent à ta recherche ! Voici les ${matchesToSend.length} meilleures :`,
                { parse_mode: 'Markdown' }
            );

            for (const match of matchesToSend) {
                await this.sendAlert(userTelegramId, match.ctx, match.scoreResult);
            }
        } else {
            await bot.api.sendMessage(
                userTelegramId,
                `🔍 J'ai regardé dans les annonces des dernières 48h, mais rien ne correspond à ta nouvelle recherche. Je garde l'œil ouvert !`,
                { parse_mode: 'Markdown' }
            );
        }
    }
}
