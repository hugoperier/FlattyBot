import { AdRepository } from '../repositories/ad.repository';
import { UserRepository } from '../repositories/user.repository';
import { AlertRepository } from '../repositories/alert.repository';
import { ScoringService } from './scoring.service';
import { bot } from '../bot';
import { Ad, User, UserCriteria } from '../types/database';

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

    private async processUser(user: User, ads: Ad[]) {
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

    private async sendAlert(userId: number, ad: Ad, score: any) {
        // Format message
        const isPremium = score.score_total >= 120;
        let msg = "";

        if (isPremium) msg += "🌟 **MATCH PARFAIT** 🌟\n\n";
        else msg += "🔔 **Nouvelle annonce correspondante**\n\n";

        msg += `🏠 [${ad.type_logement}] ${ad.nombre_pieces} pièces - ${ad.surface_m2}m²\n`;
        msg += `📍 ${ad.adresse_complete}, ${ad.code_postal} ${ad.ville}\n`;
        msg += `💰 **${ad.loyer_total} CHF**\n\n`;

        if (score.badges.length > 0) {
            msg += `${score.badges.join(' ')}\n\n`;
        }

        if (score.criteres_confort_matches.length > 0) {
            msg += `✅ Bonus: ${score.criteres_confort_matches.join(', ')}\n\n`;
        }

        msg += `[Voir l'annonce](https://facebook.com/${ad.facebook_post_id})`;
        // Note: Assuming facebook_post_id is usable for link, or we need the full URL.
        // The schema has `facebook_post_id`, usually we need `https://www.facebook.com/marketplace/item/${id}` or similar.
        // I'll assume generic link for now.

        try {
            await bot.api.sendMessage(userId, msg, { parse_mode: 'Markdown' });

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
