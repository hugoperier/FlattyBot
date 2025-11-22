import { AdRepository } from '../repositories/ad.repository';
import { Ad } from '../types/database';

export class AdService {
    private adRepository: AdRepository;

    constructor() {
        this.adRepository = new AdRepository();
    }

    async getNewAds(): Promise<Ad[]> {
        // Fetch ads created in the last 48 hours
        // In a real production scenario, we might want to track the last checked timestamp
        // to avoid re-fetching everything. But for now, 48h window is fine as we check "sent_alerts" later.
        return this.adRepository.getRecentAds(48);
    }
}
