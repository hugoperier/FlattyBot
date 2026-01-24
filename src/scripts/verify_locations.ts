
import { LocationRepository } from '../repositories/LocationRepository';
import { ProximityGraph } from '../repositories/ProximityGraph';

async function main() {
    console.log('Starting Location Data Verification...\n');

    const locationRepo = new LocationRepository();
    const proximityGraph = new ProximityGraph();

    let issueCount = 0;

    // 1. Validate Internal Consistency of known_locations.json
    console.log('--- Checking Internal Consistency of known_locations.json ---');
    const internalErrors = locationRepo.validateInternalConsistency();
    if (internalErrors.length > 0) {
        internalErrors.forEach(err => console.error(`[INTERNAL ERROR] ${err}`));
        issueCount += internalErrors.length;
    } else {
        console.log('✅ Internal consistency check passed.');
    }
    console.log('');

    // 2. Validate Consistency between known_locations.json and proximity.json
    console.log('--- Checking Consistency between known_locations.json and proximity.json ---');
    const canonicalLocations = locationRepo.getCanonicalLocations();
    const proximityNodes = proximityGraph.getAllNodes();

    // Check if every canonical location exists in proximity.json
    canonicalLocations.forEach(loc => {
        if (!proximityGraph.hasNode(loc)) {
            console.error(`[MISSING NODE] Canonical location "${loc}" is missing in proximity.json`);
            issueCount++;
        }
    });

    // Check if every node in proximity.json is a canonical location (Optional, but good practice)
    proximityNodes.forEach(node => {
        if (!canonicalLocations.has(node)) {
            console.warn(`[EXTRA NODE] proximity.json contains node "${node}" which is not in canonical locations`);
            // This might not be an error strictly speaking, but worth noting.
        }
    });

    console.log('');

    // 3. Validate DB Terms Mapping Consistency
    console.log('--- Checking DB Terms Mapping Consistency ---');
    const dbMappingErrors = locationRepo.validateDbTermsConsistency();
    if (dbMappingErrors.length > 0) {
        dbMappingErrors.forEach(err => console.error(err));
        issueCount += dbMappingErrors.length;
    } else {
        console.log('✅ DB Terms mapping consistency check passed.');
    }

    console.log('');
    if (issueCount === 0) {
        console.log('✅ All checks passed successfully!');
    } else {
        console.error(`❌ Found ${issueCount} issues.`);
        process.exit(1);
    }
}

main().catch(console.error);
