/**
 * Pull a snapshot of the dev DB and save it to tests/fixtures/db-snapshots/<name>.json
 *
 * Usage:
 *   npm run e2e:pull-snapshot -- --name default
 *   npm run e2e:pull-snapshot -- --name sparse-geneva --max-ads 3
 *
 * The snapshot is used by E2E tests through repo-fakes.ts.
 * PII is lightly obscured: telegram_id values are replaced with sequential integers.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load dev env before importing supabase
dotenv.config({ path: path.join(process.cwd(), '.env.development') });

import { supabase } from '../../src/config/supabase';

interface SnapshotArgs {
    name: string;
    maxAds: number;
}

function parseArgs(): SnapshotArgs {
    const args = process.argv.slice(2);
    const nameIdx = args.indexOf('--name');
    const maxAdsIdx = args.indexOf('--max-ads');

    return {
        name: nameIdx >= 0 ? args[nameIdx + 1] : 'default',
        maxAds: maxAdsIdx >= 0 ? parseInt(args[maxAdsIdx + 1], 10) : 100,
    };
}

async function pullSnapshot({ name, maxAds }: SnapshotArgs) {
    console.log(`Pulling snapshot "${name}" (max ${maxAds} ads)…`);

    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Fetch recent FB ads
    const { data: fbAds, error: fbErr } = await supabase
        .from('fb_annonces_location')
        .select('*')
        .gt('created_at', cutoff48h)
        .order('created_at', { ascending: false })
        .limit(maxAds);

    if (fbErr) {
        console.error('Error fetching fb_annonces_location:', fbErr.message);
        process.exit(1);
    }

    // Fetch agency ads
    const { data: agencyAds, error: agencyErr } = await supabase
        .from('agency_ads')
        .select('*')
        .gt('created_at', cutoff48h)
        .order('created_at', { ascending: false })
        .limit(maxAds);

    if (agencyErr) {
        console.warn('Warning: could not fetch agency_ads:', agencyErr.message);
    }

    // Fetch users (obfuscate telegram_id)
    const { data: users, error: usersErr } = await supabase
        .from('users')
        .select('*')
        .eq('is_active', true)
        .limit(20);

    if (usersErr) {
        console.warn('Warning: could not fetch users:', usersErr.message);
    }

    // Fetch user_criteria
    const { data: criteria, error: criteriaErr } = await supabase
        .from('user_criteria')
        .select('*')
        .limit(20);

    if (criteriaErr) {
        console.warn('Warning: could not fetch user_criteria:', criteriaErr.message);
    }

    // Obfuscate PII: replace real telegram_ids with sequential integers
    let idCounter = 1000;
    const idMap = new Map<number, number>();

    function obfuscateId(realId: number): number {
        if (!idMap.has(realId)) idMap.set(realId, idCounter++);
        return idMap.get(realId)!;
    }

    const obfuscatedUsers = (users ?? []).map(u => ({
        ...u,
        telegram_id: obfuscateId(u.telegram_id),
        username: u.username ? '[redacted]' : null,
        first_name: 'Test',
        last_name: null,
    }));

    const obfuscatedCriteria = (criteria ?? []).map(c => ({
        ...c,
        user_id: obfuscateId(c.user_id),
    }));

    const snapshot = {
        _meta: {
            pulled_at: new Date().toISOString(),
            name,
            max_ads: maxAds,
            fb_ads_count: (fbAds ?? []).length,
            agency_ads_count: (agencyAds ?? []).length,
        },
        users: obfuscatedUsers,
        user_criteria: obfuscatedCriteria,
        fb_annonces_location: fbAds ?? [],
        agency_ads: agencyAds ?? [],
    };

    const outDir = path.join(process.cwd(), 'tests', 'fixtures', 'db-snapshots');
    fs.mkdirSync(outDir, { recursive: true });

    const outPath = path.join(outDir, `${name}.json`);
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf-8');

    console.log(`✅ Snapshot saved to ${outPath}`);
    console.log(`   FB ads: ${(fbAds ?? []).length}`);
    console.log(`   Agency ads: ${(agencyAds ?? []).length}`);
    console.log(`   Users: ${obfuscatedUsers.length}`);
    console.log(`   Criteria rows: ${obfuscatedCriteria.length}`);
}

pullSnapshot(parseArgs()).catch(err => {
    console.error(err);
    process.exit(1);
});
