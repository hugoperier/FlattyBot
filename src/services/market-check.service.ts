import { AdAggregationService } from './ad-aggregation.service';
import { ScoringService } from './scoring.service';
import { UserCriteria } from '../types/database';

export interface MarketCheckResult {
    total: number;
}

export class MarketCheckService {
    private adAggregationService: AdAggregationService;
    private scoringService: ScoringService;

    constructor() {
        this.adAggregationService = new AdAggregationService();
        this.scoringService = new ScoringService();
    }

    async countMatchesOverWindow(criteria: UserCriteria, hours: number = 336): Promise<MarketCheckResult> {
        const adContexts = await this.adAggregationService.getRecentAdsForCatchup(hours);

        let total = 0;
        for (const ctx of adContexts) {
            const result = this.scoringService.calculateScore(ctx.scoringAd, criteria);
            if (result.score_total > 0) total++;
        }

        return { total };
    }
}
