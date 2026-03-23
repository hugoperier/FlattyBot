import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { ScoringService } from '../../src/services/scoring.service';

const args = process.argv.slice(2);

function printHelp() {
    console.log(`
🏠 FlattyBot Evaluation CLI

Options:
  --pull-listings    Fetch real ads from local dev DB and save to tests/fixtures/listings.json
  --pull-dataset     (Placeholder) Download the latest openai evals dataset
  --file <path>      Path to the eval JSON file (default: tests/flattybot_1.json)
  --test <type>      Type of test to run: 'extraction', 'scoring', or 'all' (default: all)
  --case <num>       Specific dataset case number to use for the scoring test
  --help             Show this help message
`);
}


if (args.includes('--help')) {
    printHelp();
    process.exit(0);
}

if (args.includes('--pull-listings')) {
    console.log('\x1b[36m%s\x1b[0m', 'Executing pull-listings pipeline...');
    execSync('npx ts-node tests/cli/pull-listings.ts', { stdio: 'inherit', cwd: path.join(__dirname, '..', '..') });
    process.exit(0);
}

if (args.includes('--pull-dataset')) {
    console.log('\x1b[36m%s\x1b[0m', 'Fetching latest OpenAI evals dataset... (To be implemented)');
    process.exit(0);
}

const fileIndex = args.indexOf('--file');
const datasetPath = fileIndex > -1 ? args[fileIndex + 1] : path.join(__dirname, '..', 'flattybot_1.json');

const testIndex = args.indexOf('--test');
const testType = testIndex > -1 ? args[testIndex + 1] : 'all';

const caseIndex = args.indexOf('--case');
const targetCase = caseIndex > -1 ? parseInt(args[caseIndex + 1], 10) : null;

if (!fs.existsSync(datasetPath)) {
    console.error(`\x1b[31mError: Dataset file not found at ${datasetPath}\x1b[0m`);
    process.exit(1);
}

const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));

// Extract AI response from the OpenAI Eval JSON Structure
function extractCriteria(entry: any) {
    if (!entry.prompt_1_output || !entry.prompt_1_output.output) return null;

    // Find the message type output
    const messageOutput = entry.prompt_1_output.output.find((o: any) => o.type === 'message');
    if (!messageOutput || !messageOutput.content) return null;

    // Find the output text
    const textContent = messageOutput.content.find((c: any) => c.type === 'output_text');
    if (!textContent || !textContent.text) return null;

    try {
        return JSON.parse(textContent.text);
    } catch (e) {
        console.error('Failed to parse AI output text as JSON:', textContent.text);
        return null;
    }
}

function runExtractionTest() {
    console.log('\n\x1b[45m\x1b[37m TEST 1: EXTRACTION QUALITY (OPENAI) \x1b[0m\n');
    let passed = 0;
    let failed = 0;
    let parseErrors = 0;

    process.stdout.write('Running evaluation ');

    dataset.forEach((entry: any, index: number) => {
        const graderPass = entry['prompt_1_Scoring grader_pass'] === true;

        const criteria = extractCriteria(entry);
        if (!criteria) {
            parseErrors++;
            process.stdout.write('\x1b[31mE\x1b[0m');
            return;
        }

        if (graderPass) {
            passed++;
            process.stdout.write('\x1b[32m.\x1b[0m');
        } else {
            failed++;
            process.stdout.write('\x1b[31mx\x1b[0m');
        }
    });

    console.log('\n');
    console.log(`\x1b[36m--- Extraction Summary ---\x1b[0m`);
    console.log(`Total Cases:    ${dataset.length}`);
    console.log(`Passed:         \x1b[32m${passed}\x1b[0m`);
    console.log(`Failed:         \x1b[31m${failed}\x1b[0m`);
    console.log(`Parsing Errors: \x1b[35m${parseErrors}\x1b[0m`);
    console.log(`Score:          \x1b[1m${((passed / dataset.length) * 100).toFixed(1)}%\x1b[0m\n`);
}

function isGroundTruthMatch(labeled: any, criteria: any): boolean {
    const stricts = criteria.criteres_stricts;
    if (!labeled) return false;

    if (stricts.budget_max && labeled.budget && labeled.budget > stricts.budget_max) return false;
    if (stricts.nombre_pieces_min && labeled.rooms && labeled.rooms < stricts.nombre_pieces_min) return false;
    if (stricts.nombre_pieces_max && labeled.rooms && labeled.rooms > stricts.nombre_pieces_max) return false;

    if (stricts.type_logement && stricts.type_logement.length > 0 && labeled.type) {
        if (!stricts.type_logement.some((t: string) => labeled.type.toLowerCase().includes(t.toLowerCase()))) return false;
    }

    if (stricts.zones && stricts.zones.length > 0 && labeled.resolved_zones) {
        if (!stricts.zones.some((z: string) => labeled.resolved_zones.includes(z))) return false;
    }

    return true;
}

function runScoringTest() {
    console.log('\n\x1b[44m\x1b[37m TEST 2: SCORING ALGORITHM \x1b[0m\n');

    // Load local fixtures
    const listingsPath = path.join(__dirname, '..', 'fixtures', 'listings.json');
    if (!fs.existsSync(listingsPath)) {
        console.error(`\x1b[31mError: Listings fixture missing. Run '--pull-listings' first.\x1b[0m`);
        return;
    }

    const rawListings = JSON.parse(fs.readFileSync(listingsPath, 'utf8'));
    const scoringService = new ScoringService();

    console.log(`Loaded ${rawListings.length} local listings for testing.\n`);

    const casesToRun = targetCase ? [targetCase - 1] : Array.from({ length: dataset.length }, (_, i) => i);

    for (const dataIndex of casesToRun) {
        if (dataIndex < 0 || dataIndex >= dataset.length) {
            console.error(`\x1b[31mError: Case ${dataIndex + 1} is out of bounds (Total: ${dataset.length}).\x1b[0m`);
            continue;
        }

        const entry = dataset[dataIndex];
        const criteriaExtraction = extractCriteria(entry);
        if (!criteriaExtraction) {
            console.log(`\x1b[33mCase #${dataIndex + 1}\x1b[0m: Skipped (Parse Error)`);
            continue;
        }

        const userCriteriaMock: any = {
            user_id: 1,
            criteres_stricts: criteriaExtraction.criteres_stricts,
            criteres_confort: criteriaExtraction.criteres_confort,
            description_originale: entry.userdescription,
            resume_humain: criteriaExtraction.resume_humain
        };

        const scoredPairs: Array<{ ad: any, raw: any, scoreResult: any }> = [];
        let tp = 0; let fp = 0; let tn = 0; let fn = 0;

        for (const rawListing of rawListings) {
            const ad = rawListing.scoringAd;
            const scoreResult = scoringService.calculateScore(ad, userCriteriaMock);

            const predictedMatch = scoreResult.score_total > 0;
            const expectedMatch = isGroundTruthMatch(rawListing.labeled_features, userCriteriaMock);

            if (predictedMatch && expectedMatch) tp++;
            else if (predictedMatch && !expectedMatch) fp++;
            else if (!predictedMatch && !expectedMatch) tn++;
            else if (!predictedMatch && expectedMatch) fn++;

            if (predictedMatch) {
                scoredPairs.push({ ad, raw: rawListing, scoreResult });
            }
        }

        scoredPairs.sort((a, b) => b.scoreResult.score_total - a.scoreResult.score_total);

        console.log(`\x1b[1m\x1b[33mCase #${dataIndex + 1}\x1b[0m: "${entry.userdescription}"`);
        console.log(`  \x1b[90mBudget: ${userCriteriaMock.criteres_stricts.budget_max || 'Any'}, Zones: ${userCriteriaMock.criteres_stricts.zones?.join(', ')}, Type: ${userCriteriaMock.criteres_stricts.type_logement?.join(', ')}\x1b[0m`);
        console.log(`  \x1b[34mMatches Found\x1b[0m: ${scoredPairs.length} / ${rawListings.length}`);

        if (scoredPairs.length > 0) {
            console.log(`  \x1b[1mTop 3 Suggestions:\x1b[0m`);
            const bestLinks = scoredPairs.slice(0, 3);
            bestLinks.forEach((best, bIdx) => {
                console.log(`    ${bIdx + 1}. \x1b[32m${best.scoreResult.score_total} pts\x1b[0m | ${best.ad.ville} (${best.ad.loyer_total} CHF) | ${best.ad.type_logement} ${best.ad.nombre_pieces}p.`);
                if (best.scoreResult.badges.length > 0) {
                    console.log(`       \x1b[90mBadges: ${best.scoreResult.badges.join(', ')}\x1b[0m`);
                }
            });
        }

        // Output Confusion Matrix
        console.log(`\n  \x1b[1mConfusion Matrix (Strict Evaluation vs Ground Truth)\x1b[0m`);
        console.log(`  --------------------------------------------------`);
        console.log(`  |             |  Expected YES  |  Expected NO    |`);
        console.log(`  --------------------------------------------------`);
        console.log(`  | Pred YES    | \x1b[32m${tp.toString().padStart(12, ' ')}\x1b[0m   | \x1b[31m${fp.toString().padStart(12, ' ')}\x1b[0m    |`);
        console.log(`  | Pred NO     | \x1b[31m${fn.toString().padStart(12, ' ')}\x1b[0m   | \x1b[32m${tn.toString().padStart(12, ' ')}\x1b[0m    |`);
        console.log(`  --------------------------------------------------`);
        const precision = tp + fp > 0 ? (tp / (tp + fp) * 100).toFixed(1) : 'N/A';
        const recall = tp + fn > 0 ? (tp / (tp + fn) * 100).toFixed(1) : 'N/A';
        console.log(`  \x1b[36mPrecision (Truth in Matches):\x1b[0m ${precision}%`);
        console.log(`  \x1b[36mRecall    (Yield of Truth):\x1b[0m   ${recall}%`);
        console.log('\n======================================================\n');
    }
}

// ----------------------------------------------------
// Main Execution
// ----------------------------------------------------

console.log(`\x1b[1mFlattyBot Evaluator Tool\x1b[0m`);
console.log(`Using dataset: ${datasetPath}`);

if (testType === 'extraction' || testType === 'all') {
    runExtractionTest();
}

if (testType === 'scoring' || testType === 'all') {
    runScoringTest();
}
