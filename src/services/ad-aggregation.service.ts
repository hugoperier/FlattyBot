import { Ad, AdWithPost } from '../types/database';
import { AdRepository } from '../repositories/ad.repository';
import { MksaAdRepository, MksaAnnonce } from '../repositories/mksa-ad.repository';

export type AdSource = 'facebook' | 'mksa';

/**
 * Minimal shape passed to the scoring engine.
 * We reuse the existing `Ad` interface so that the scoring
 * and location resolution logic stay unchanged.
 */
export type ScoringAd = Ad;

export interface AdContext {
    source: AdSource;
    scoringAd: ScoringAd;
    facebookAd?: AdWithPost;
    mksaAd?: MksaAnnonce;
}

/**
 * Helper responsible for fetching ads from all underlying sources
 * and exposing a unified view for the PollingService.
 *
 * For Facebook:
 *   - We keep the existing 48h sliding window and rely on `sent_alerts`
 *     for per-user de-duplication.
 *
 * For MKSA (régies):
 *   - We only fetch ads created strictly after the last seen `created_at`
 *     timestamp (per process). This ensures each régie ad is processed
 *     une seule fois par le bot, sans introduire de nouvelle table.
 */
export class AdAggregationService {
    private fbRepo: AdRepository;
    private mksaRepo: MksaAdRepository;

    /**
     * Last MKSA `created_at` we've seen (ISO string).
     * Used as a moving cursor to avoid reprocessing the same rows.
     */
    private lastMksaCreatedAt: string | null = null;

    constructor() {
        this.fbRepo = new AdRepository();
        this.mksaRepo = new MksaAdRepository();
    }

    /**
     * Fetch ads from all sources for polling.
     *
     * @param facebookHours Window in hours for Facebook ads (default 48h)
     */
    async getAdsForPolling(facebookHours: number = 48): Promise<AdContext[]> {
        const now = new Date();

        // 1. Facebook ads: keep existing behaviour (48h window)
        const fbAds = await this.fbRepo.getRecentAds(facebookHours);

        // 2. MKSA ads: only new ones since lastMksaCreatedAt (or same initial window)
        let mksaSinceIso: string;
        if (this.lastMksaCreatedAt) {
            mksaSinceIso = this.lastMksaCreatedAt;
        } else {
            const cutoff = new Date(now.getTime() - facebookHours * 60 * 60 * 1000 * 100).toISOString();
            mksaSinceIso = cutoff;
        }

        const mksaAds = await this.mksaRepo.getAdsSince(mksaSinceIso);

        if (mksaAds.length > 0) {
            const latestCreatedAt = mksaAds.reduce((max, ad) => {
                return ad.created_at > max ? ad.created_at : max;
            }, this.lastMksaCreatedAt || mksaAds[0].created_at);

            this.lastMksaCreatedAt = latestCreatedAt;
        }

        const contexts: AdContext[] = [];

        // Facebook: direct mapping (AdWithPost extends Ad)
        for (const ad of fbAds) {
            contexts.push({
                source: 'facebook',
                scoringAd: ad,
                facebookAd: ad
            });
        }

        // MKSA: adapt to scoring shape
        for (const ad of mksaAds) {
            const scoringAd = this.mapMksaToScoringAd(ad);
            contexts.push({
                source: 'mksa',
                scoringAd,
                mksaAd: ad
            });
        }

        return contexts;
    }

    /**
     * Map a MKSA row to the existing `Ad` shape used by the scoring logic.
     * Only the fields used by `ScoringService` and `LocationRepository`
     * are filled; the rest is left null/undefined.
     */
    private mapMksaToScoringAd(ad: MksaAnnonce): ScoringAd {
        // Extract some location hints from the free-form address
        const rawAddress = ad.address || '';
        const ville = this.extractVilleFromAddress(rawAddress);
        const codePostal = this.extractPostalCodeFromAddress(rawAddress);

        const loyerTotal = ad.monthly_price ?? ad.monthly_net_price ?? null;

        return {
            // `id` is not used by the scoring logic; keep a dummy numeric id
            // Actual MKSA id reste disponible dans AdContext.mksaAd.id
            id: 0,
            facebook_post_id: '',
            adresse_complete: rawAddress || null,
            rue: null,
            numero_rue: null,
            ville: ville,
            code_postal: codePostal,
            quartier: null,
            nombre_pieces: ad.number_rooms ?? null,
            type_logement: null,
            surface_m2: ad.surface_m2 ?? null,
            etage: null,
            dernier_etage: null,
            nombre_chambres: null,
            balcon: ad.balcony ?? null,
            terrasse: null,
            meuble: null,
            loyer_mensuel: ad.monthly_net_price ?? null,
            loyer_total: loyerTotal,
            parking_inclus: ad.car_park ?? null,
            date_disponibilite: ad.available_date,
            urgence: false,
            image_path: null,
            created_at: ad.created_at
        };
    }

    private extractVilleFromAddress(address: string): string | null {
        const lower = address.toLowerCase();
        if (!lower) return null;

        if (lower.includes('genève') || lower.includes('geneve')) {
            return 'Genève';
        }

        // Fallback: try to take last token before "switzerland"
        const parts = address.split(',');
        if (parts.length >= 2) {
            const candidate = parts[parts.length - 2].trim();
            return candidate || null;
        }

        return null;
    }

    private extractPostalCodeFromAddress(address: string): string | null {
        const match = address.match(/\b(\d{4})\b/);
        return match ? match[1] : null;
    }
}

