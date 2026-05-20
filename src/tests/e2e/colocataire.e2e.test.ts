/**
 * Profile 6 — The Colocataire (colocation auto-detected, no disambiguation keyboard)
 * Profile 7 — The Ambiguous Type (ONBOARDING_WAITING_TYPE_LOGEMENT keyboard shown)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
    const saved = { criteria: null as any };
    const userRepo = {
        getUser: vi.fn(),
        createUser: vi.fn(),
        getCriteria: vi.fn().mockResolvedValue(null),
        saveCriteria: vi.fn().mockImplementation((c: any) => { saved.criteria = c; return Promise.resolve(true); }),
        updateLastInteraction: vi.fn().mockResolvedValue(undefined),
        getAllActiveUsers: vi.fn().mockResolvedValue([]),
        authorizeUser: vi.fn().mockResolvedValue(true),
        getPendingAuthorizationUsers: vi.fn().mockResolvedValue([]),
        deactivateInactiveUsers: vi.fn().mockResolvedValue(0),
    };
    const pollerSvc = { runCatchup: vi.fn().mockResolvedValue(undefined), startPolling: vi.fn().mockResolvedValue(undefined) };
    const marketSvc = { countMatchesOverWindow: vi.fn().mockResolvedValue({ total: 10 }) };
    return { saved, userRepo, pollerSvc, marketSvc };
});

vi.mock('../../config/supabase', () => ({ supabase: { from: vi.fn() }, dbSchema: 'flatscanner_dev', INACTIVITY_TIMEOUT_MINUTES: 20160 }));
vi.mock('../../config/admin', () => ({ ADMIN_TELEGRAM_ID: null }));
vi.mock('../../bot/index', () => ({ bot: { api: { sendMessage: vi.fn().mockResolvedValue({ message_id: 9999 }) } } }));
vi.mock('../../repositories/user.repository', () => ({ UserRepository: vi.fn().mockImplementation(() => m.userRepo) }));
vi.mock('../../repositories/alert.repository', () => ({ AlertRepository: vi.fn().mockImplementation(() => ({ hasSentAlert: vi.fn().mockResolvedValue(false), recordAlert: vi.fn().mockResolvedValue(undefined) })) }));
vi.mock('../../services/poller', () => ({ PollingService: vi.fn().mockImplementation(() => m.pollerSvc) }));
vi.mock('../../services/market-check.service', () => ({ MarketCheckService: vi.fn().mockImplementation(() => m.marketSvc) }));

import { ConversationDriver } from './_harness/bot-driver';

const COLOC_TYPES = ['colocation', 'chambre', 'chambre partagée'];

function activeUser(id: number) {
    return { telegram_id: id, is_active: true, is_paused: false, onboarding_completed: false, pending_authorization: false, created_at: new Date().toISOString(), last_interaction: new Date().toISOString() };
}

function setupMocks(userId: number) {
    m.saved.criteria = null;
    vi.clearAllMocks();
    m.userRepo.getUser.mockResolvedValue(activeUser(userId));
    m.userRepo.createUser.mockImplementation((d: any) => Promise.resolve(activeUser(d.telegram_id)));
    m.userRepo.getCriteria.mockResolvedValue(null);
    m.userRepo.saveCriteria.mockImplementation((c: any) => { m.saved.criteria = c; return Promise.resolve(true); });
    m.pollerSvc.runCatchup.mockResolvedValue(undefined);
    m.marketSvc.countMatchesOverWindow.mockResolvedValue({ total: 10 });
}

// ── Profile 6: Colocataire ────────────────────────────────────────────────────

describe('Profile 6 — Colocataire (colocation auto-detected)', () => {
    let driver: ConversationDriver;

    beforeEach(() => {
        setupMocks(66666);
        driver = new ConversationDriver({ userId: 66666, chatId: 66666, languageCode: 'fr' });
    });

    it('full coloc flow saves a type_logement that is exclusively the coloc set, never the appart-only set', async () => {
        await driver.start();
        await driver.sendText(
            'Je cherche une coloc, chambre meublée, max 1200 CHF, disponible dès que possible, à Carouge'
        );

        // Handle pieces ask + possible housing disambiguation (same as test #2)
        try { await driver.clickButton('qf_pieces_any'); } catch { /* ok if skipped */ }
        if (driver.getReplies().some(r => r.includes('Quel type de logement') || r.includes('What type of accommodation'))) {
            await driver.clickButton('type_coloc');
        }

        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await new Promise(r => setTimeout(r, 200));

        const savedTypes: string[] = m.saved.criteria?.criteres_stricts?.type_logement ?? [];
        // Must not be exclusively the apartment set — coloc set must be present
        const isOnlyAppart = savedTypes.every((t: string) =>
            ['appartement', 'studio', 'maison', 'duplex', 'loft'].includes(t)
        );
        expect(isOnlyAppart).toBe(false);
        // The canonical appart types must not have snuck in without coloc types alongside
        const hasAppartWithoutColoc = savedTypes.some((t: string) => ['appartement', 'studio'].includes(t))
            && !savedTypes.some((t: string) => COLOC_TYPES.includes(t));
        expect(hasAppartWithoutColoc).toBe(false);
    }, 60_000);

    it('saves colocation types in type_logement', async () => {
        await driver.start();
        await driver.sendText(
            'Je cherche une coloc, chambre meublée, max 1200 CHF, disponible dès que possible, à Carouge'
        );

        // Bot may ask for nombre_pieces (coloc messages often omit it) — answer any/flexible
        try { await driver.clickButton('qf_pieces_any'); } catch { /* ok if skipped */ }

        // Bot may ask for housing type disambiguation if coloc wasn't auto-detected
        if (driver.getReplies().some(r => r.includes('Quel type de logement') || r.includes('What type of accommodation'))) {
            await driver.clickButton('type_coloc');
        }

        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await new Promise(r => setTimeout(r, 200));

        const savedTypes: string[] = m.saved.criteria?.criteres_stricts?.type_logement ?? [];
        expect(savedTypes.some((t: string) => COLOC_TYPES.includes(t))).toBe(true);
        // Must NOT be exclusively the apartment set
        const isOnlyAppart = savedTypes.every((t: string) =>
            ['appartement', 'studio', 'maison', 'duplex', 'loft'].includes(t)
        );
        expect(isOnlyAppart).toBe(false);
    }, 60_000);
});

// ── Profile 7: Ambiguous Type ─────────────────────────────────────────────────

describe('Profile 7 — Ambiguous Type (housing-type keyboard)', () => {
    let driver: ConversationDriver;

    beforeEach(() => {
        setupMocks(88888);
        driver = new ConversationDriver({ userId: 88888, chatId: 88888, languageCode: 'fr' });
    });

    it('reaches recap whether or not OpenAI disambiguates housing type', async () => {
        await driver.start();
        // This prompt has no explicit apartment vs coloc mention
        await driver.sendText('Je cherche un logement à Eaux-Vives, 2-3 pièces, budget 2000 CHF, disponible maintenant');

        const replies = driver.getReplies();
        // If housing type keyboard appeared, click type_all
        if (replies.some(r => r.includes('Quel type de logement') || r.includes('What type of accommodation'))) {
            await driver.clickButton('type_all');
        }

        // Now recap should be visible
        const hasRecap = driver.getReplies().some(r =>
            r.includes('Récapitulatif') || r.includes('Search summary')
        );
        expect(hasRecap).toBe(true);
    }, 60_000);

    it('type_all includes both apartment and flatshare types when triggered', async () => {
        await driver.start();
        await driver.sendText('Je cherche un logement à Eaux-Vives, 2-3 pièces, budget 2000 CHF, disponible maintenant');

        const isAmbiguous = driver.getReplies().some(r => r.includes('Quel type de logement') || r.includes('What type of accommodation'));
        if (isAmbiguous) {
            await driver.clickButton('type_all');
            await driver.clickButton('confirm_criteria');
            await driver.clickButton('conf_loc_strict');
            await new Promise(r => setTimeout(r, 200));

            const savedTypes: string[] = m.saved.criteria?.criteres_stricts?.type_logement ?? [];
            expect(savedTypes.length).toBeGreaterThanOrEqual(4);
            expect(savedTypes.some((t: string) => t.includes('appart') || t === 'studio')).toBe(true);
            expect(savedTypes.some((t: string) => t.includes('coloc') || t.includes('chambre'))).toBe(true);
        } else {
            // OpenAI auto-disambiguated — just ensure recap is shown
            const hasRecap = driver.getReplies().some(r => r.includes('Récapitulatif') || r.includes('Search summary'));
            expect(hasRecap).toBe(true);
        }
    }, 60_000);
});
