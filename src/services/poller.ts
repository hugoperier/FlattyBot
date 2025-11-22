import { AdRepository } from '../repositories/ad.repository';
import { UserRepository } from '../repositories/user.repository';
import { AlertRepository } from '../repositories/alert.repository';
import { ScoreResult, ScoringService } from './scoring.service';
import { AlertFormatterService } from './alert-formatter.service';
import { bot } from '../bot';
import { AdWithPost, User, UserCriteria } from '../types/database';

export class PollingService {
    private adRepo: AdRepository;
    private userRepo: UserRepository;
    private alertRepo: AlertRepository;
    private scoringService: ScoringService;

    constructor() {
        this.adRepo = new AdRepository();
        this.userRepo = new UserRepository();
        this.alertRepo = new AlertRepository();
        this.scoringService = new ScoringService();
    }

    async startPolling(intervalMs: number = 3 * 60 * 1000) {
        console.log(`Starting polling service (interval: ${intervalMs}ms)...`);
        this.poll(); // Run immediately
        setInterval(() => this.poll(), intervalMs);
    }

    private async poll() {
        try {
            console.log('Polling for new ads...');
            const ads = await this.adRepo.getRecentAds(48); // Last 48h
            const users = await this.userRepo.getAllActiveUsers();

            console.log(`Found ${ads.length} ads and ${users.length} active users.`);

            for (const user of users) {
                await this.processUser(user, ads);
            }
        } catch (error) {
            console.error('Error in polling loop:', error);
        }
    }

    private async processUser(user: User, ads: AdWithPost[]) {
        const criteria = await this.userRepo.getCriteria(user.telegram_id);
        if (!criteria) return;

        for (const ad of ads) {
            // Check if already sent
            const alreadySent = await this.alertRepo.hasAlertBeenSent(user.telegram_id, ad.id);
            if (alreadySent) continue;

            // Calculate score
            const scoreResult = this.scoringService.calculateScore(ad, criteria);

            // Thresholds
            // If score > 0 (meaning strict criteria met), we consider sending
            // But maybe we want a minimum score? The prompt says:
            // "Critères stricts : doivent TOUS être respectés sinon score = 0 (pas d'alerte)"
            // So if score > 0, it's a match.

            if (scoreResult.score_total > 0) {
                await this.sendAlert(user.telegram_id, ad, scoreResult);
            }
        }
    }

    private async sendAlert(userId: number, ad: AdWithPost, score: ScoreResult) {
        try {
            const formatter = new AlertFormatterService();

            // Format the message
            const message = await formatter.formatAlertMessage(ad, score);

            // Check if we have a valid image
            const imageUrl = await formatter.getImageUrl(ad.image_path);

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

            // Save alert
            await this.alertRepo.saveAlert({
                user_id: userId,
                annonce_id: ad.id,
                score_total: score.score_total,
                score_criteres_stricts: score.score_criteres_stricts,
                score_criteres_confort: score.score_criteres_confort,
                criteres_stricts_matches: score.criteres_stricts_matches,
                criteres_confort_matches: score.criteres_confort_matches,
                badges: score.badges,
                user_action: 'SENT'
            });

            console.log(`Alert sent to user ${userId} for ad ${ad.id}`);
        } catch (error) {
            console.error(`Failed to send alert to ${userId}:`, error);
        }
    }
}
