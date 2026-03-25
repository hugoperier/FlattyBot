
import fs from 'fs';
import path from 'path';
import { LocationRepository } from '../../src/repositories/LocationRepository';

async function relabelDataset() {
    const listingsPath = path.join(__dirname, '..', 'fixtures', 'listings.json');
    const backupPath = path.join(__dirname, '..', 'fixtures', 'listings_backup.json');

    if (!fs.existsSync(listingsPath)) {
        console.error('Error: listings.json not found.');
        return;
    }

    // Create backup
    fs.copyFileSync(listingsPath, backupPath);
    console.log(`Backup created at: ${backupPath}`);

    const rawListings = JSON.parse(fs.readFileSync(listingsPath, 'utf8'));
    const locationRepo = new LocationRepository();

    let zoneFixes = 0;
    let budgetFixes = 0;
    let roomFixes = 0;

    for (const entry of rawListings) {
        const scraped = entry.scoringAd;
        const labeled = entry.labeled_features;

        if (!scraped || !labeled) continue;

        // 1. Fix Zones if empty
        if (!labeled.resolved_zones || labeled.resolved_zones.length === 0) {
            const foundZones = new Set<string>();

            // Try Ville
            if (scraped.ville) {
                locationRepo.findCanonical(scraped.ville, true).forEach(z => foundZones.add(z));
            }
            // Try Quartier
            if (scraped.quartier) {
                locationRepo.findCanonical(scraped.quartier, true).forEach(z => foundZones.add(z));
            }
            // Try Code Postal
            if (scraped.code_postal) {
                locationRepo.findCanonical(scraped.code_postal.toString(), true).forEach(z => foundZones.add(z));
            }
            // Try Text content if still empty
            if (foundZones.size === 0 && scraped.facebook_posts?.input_data?.text) {
                // Heuristic: search for all canonical names in the text
                const text = scraped.facebook_posts.input_data.text.toLowerCase();
                locationRepo.getCanonicalLocations().forEach(loc => {
                    if (text.includes(loc.toLowerCase())) {
                        foundZones.add(loc);
                    }
                });
            }

            if (foundZones.size > 0) {
                labeled.resolved_zones = Array.from(foundZones);
                zoneFixes++;
            }
        }

        // 2. Fix Budget if null but scraped is available
        const scrapedPrice = scraped.loyer_total || scraped.loyer_mensuel;
        if (labeled.budget === null && scrapedPrice !== null) {
            labeled.budget = scrapedPrice;
            budgetFixes++;
        }

        // 3. Fix Rooms if null but scraped is available
        if (labeled.rooms === null && scraped.nombre_pieces !== null) {
            labeled.rooms = scraped.nombre_pieces;
            roomFixes++;
        }

        // 4. Fix Type if missing
        if (!labeled.type && scraped.type_logement) {
            labeled.type = scraped.type_logement;
        }
    }

    // Write back
    fs.writeFileSync(listingsPath, JSON.stringify(rawListings, null, 2));

    console.log(`\n--- Dataset Repair Completed ---`);
    console.log(`Zone Labels Recovered:   ${zoneFixes}`);
    console.log(`Budget Labels Updated:   ${budgetFixes}`);
    console.log(`Room Labels Updated:     ${roomFixes}`);
    console.log(`Total Ads Processed:     ${rawListings.length}`);
}

relabelDataset().catch(console.error);
