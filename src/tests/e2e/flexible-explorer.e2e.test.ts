/**
 * Profile 3 — The Flexible Explorer (accepts proximity suggestions)
 * Profile 4 — The Strict Purist (keeps exact zones only)
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
    const marketSvc = { countMatchesOverWindow: vi.fn().mockResolvedValue({ total: 22 }) };
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

// Plainpalais neighbors in proximity.json: Jonction, Acacias, Champel, Cité-Centre
const PLAINPALAIS_NEIGHBORS = ['Jonction', 'Acacias', 'Champel', 'Cité-Centre'];
const MESSAGE = 'Appartement à Plainpalais, budget 2200 CHF, 2 pièces minimum, disponible maintenant';

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
    m.marketSvc.countMatchesOverWindow.mockResolvedValue({ total: 22 });
}

// ── Profile 3: Flexible Explorer ─────────────────────────────────────────────

describe('Profile 3 — Flexible Explorer (conf_loc_all)', () => {
    let driver: ConversationDriver;

    beforeEach(() => {
        setupMocks(33333);
        driver = new ConversationDriver({ userId: 33333, chatId: 33333, languageCode: 'fr' });
    });

    it('shows proximity suggestions for Plainpalais', async () => {
        await driver.start();
        await driver.sendText(MESSAGE);
        await driver.clickButton('confirm_criteria');

        const suggestionShown = driver.getReplies().some(r =>
            PLAINPALAIS_NEIGHBORS.some(n => r.includes(n)) ||
            r.includes('limitrophe') || r.includes('suggestion') || r.includes('voisin')
        );
        expect(suggestionShown).toBe(true);
    }, 60_000);

    it('adds neighbor zones when conf_loc_all is clicked', async () => {
        await driver.start();
        await driver.sendText(MESSAGE);
        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_all');
        await new Promise(r => setTimeout(r, 200));

        const zones: string[] = m.saved.criteria?.criteres_stricts?.zones ?? [];
        expect(zones).toContain('Plainpalais');
        expect(PLAINPALAIS_NEIGHBORS.some(n => zones.includes(n))).toBe(true);
        expect(zones.length).toBeGreaterThan(1);
    }, 60_000);
});

// ── Profile 4: Strict Purist ──────────────────────────────────────────────────

describe('Profile 4 — Strict Purist (conf_loc_strict)', () => {
    let driver: ConversationDriver;

    beforeEach(() => {
        setupMocks(44444);
        driver = new ConversationDriver({ userId: 44444, chatId: 44444, languageCode: 'fr' });
    });

    it('keeps only original zone when conf_loc_strict is clicked', async () => {
        await driver.start();
        await driver.sendText(MESSAGE);
        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await new Promise(r => setTimeout(r, 200));

        const zones: string[] = m.saved.criteria?.criteres_stricts?.zones ?? [];
        expect(zones).toContain('Plainpalais');
        expect(PLAINPALAIS_NEIGHBORS.some(n => zones.includes(n))).toBe(false);
    }, 60_000);
});
