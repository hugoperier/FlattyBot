
import { LocationRepository } from '../repositories/LocationRepository';
import { ScoringService } from '../services/scoring.service';
import { Ad, UserCriteria } from '../types/database';

async function runTest() {
    console.log("--- Verifying Location Logic ---");

    const repo = new LocationRepository();
    const scoring = new ScoringService();

    // 1. Test Canonical Lookup
    console.log("\n1. Testing Canonical Lookup:");

    // Case A: Exact Match
    const carouge = repo.findCanonical("Carouge");
    console.log(`Input 'Carouge' -> ${JSON.stringify(carouge)}`);
    if (!carouge.includes("Carouge")) console.error("FAIL: Carouge not found");

    // Case B: Alias (Misspelling/Variant) - assuming one exists in JSON or we use db_terms_mapping
    // Let's assume 'plainpalais' is lowercase in input
    const plainpalais = repo.findCanonical("plainpalais");
    console.log(`Input 'plainpalais' -> ${JSON.stringify(plainpalais)}`);

    // Case C: DB Terms Mapping
    const petitSaconnex = repo.findCanonical("geneve-petit-saconnex");
    console.log(`Input 'geneve-petit-saconnex' (from DB mapping) -> ${JSON.stringify(petitSaconnex)}`);
    if (!petitSaconnex.includes("Petit-Saconnex")) console.error("FAIL: Petit-Saconnex not found via DB mapping");

    const cornavin = repo.findCanonical("Cornavin");
    console.log(`Input 'Cornavin' (from DB mapping) -> ${JSON.stringify(cornavin)}`);
    if (!cornavin.includes("Grottes")) console.error("FAIL: Cornavin -> Grottes mapping failed");

    // 2. Test Ad Resolution (Quartier Priority)
    console.log("\n2. Testing Ad Resolution:");

    const ad1 = {
        quartier: "Carouge",
        ville: "Genève"
    } as Ad;
    const res1 = repo.resolveAdLocation(ad1);
    console.log(`Ad(quartier: Carouge) -> ${JSON.stringify(res1)}`);

    const ad2 = {
        quartier: null,
        ville: "Carouge"
    } as Ad;
    const res2 = repo.resolveAdLocation(ad2);
    console.log(`Ad(quartier: null, ville: Carouge) -> ${JSON.stringify(res2)}`);

    // 3. Test Scoring Match (Zone)
    console.log("\n3. Testing Scoring Match:");

    const criteria = {
        criteres_stricts: {
            zones: ["Carouge"], // User wants Carouge
            budget_max: 2000
        },
        criteres_confort: {}
    } as any as UserCriteria;

    // Ad is in Carouge
    const score1 = scoring.calculateScore(ad1, criteria);
    console.log(`Score for Ad in 'Carouge' vs User 'Carouge': ${score1.score_criteres_stricts} (Strict Score)`);
    if (score1.score_total === 0) console.error("FAIL: Should match Carouge");

    // Ad is in Eaux-Vives
    const ad3 = { quartier: "Eaux-Vives" } as Ad;
    const score2 = scoring.calculateScore(ad3, criteria);
    console.log(`Score for Ad in 'Eaux-Vives' vs User 'Carouge': ${score2.score_total}`);
    if (score2.score_total > 0) console.error("FAIL: Should NOT match Eaux-Vives");

    console.log("\n--- Verification Complete ---");
}

runTest().catch(console.error);
