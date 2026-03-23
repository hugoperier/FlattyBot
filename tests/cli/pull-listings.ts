import fs from 'fs';
import path from 'path';
import { AdAggregationService, AdContext } from '../../src/services/ad-aggregation.service';
import { LocationRepository } from '../../src/repositories/LocationRepository';

async function main() {
    console.log('Fetching listings from the last 2 weeks...');
    const adAggregationService = new AdAggregationService();
    const locationRepository = new LocationRepository();
    
    // We use a large window (90 days = 2160 hours) because dev databases 
    // often have older listings. The goal is just to grab a solid sample.
    const adsContext = await adAggregationService.getRecentAdsForCatchup(2160);
    
    console.log(`Found ${adsContext.length} ads across all sources.`);
    
    // Format the output
    const outputListings = adsContext.map((context: AdContext) => {
        const ad = context.scoringAd;
        
        // Use LocationRepository to determine the normalized zone/locations for this ad
        // This is exactly how the scoring algorithm "sees" the ad location
        const isGeneve = ad.ville?.toLowerCase().includes('geneve') || false;
        const resolvedLocations = locationRepository.resolveAdLocation(ad, isGeneve);

        return {
            id: ad.id || context.agencyAd?.id || context.facebookAd?.id,
            source: context.source,
            created_at: ad.created_at,
            
            // Raw scoring properties
            scoringAd: ad,

            // Pre-labeled fields (what the current flattybot thinks this ad is)
            labeled_features: {
                budget: ad.loyer_total || ad.loyer_mensuel || null,
                rooms: ad.nombre_pieces || null,
                type: ad.type_logement || null,
                resolved_zones: resolvedLocations,
                comfort: {
                    balcony: ad.balcon || ad.terrasse || false,
                    top_floor: ad.dernier_etage || false,
                    furnished: ad.meuble || false,
                    parking: ad.parking_inclus || false
                }
            },
            
            // Allow manual correction flag
            _manual_review_needed: true
        };
    });

    const fixturesDir = path.join(__dirname, '..', 'fixtures');
    if (!fs.existsSync(fixturesDir)) {
        fs.mkdirSync(fixturesDir, { recursive: true });
    }

    const outputFile = path.join(fixturesDir, 'listings.json');
    fs.writeFileSync(outputFile, JSON.stringify(outputListings, null, 2));
    
    console.log(`✅ successfully wrote ${outputListings.length} listings to ${outputFile}`);
    console.log(`Please review tests/fixtures/listings.json and adjust 'labeled_features' if needed for ground truth.`);
}

main().catch(console.error);
