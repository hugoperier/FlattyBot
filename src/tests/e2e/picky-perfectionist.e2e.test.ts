/**
 * Profile 8 — The Picky Perfectionist
 *
 * Niche criteria → MarketCheckService returns < 5 → ONBOARDING_WAITING_MARKET_DECISION.
 * User clicks market_continue; monitoring activates despite low volume.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
    const saved = { criteria: null as any };
    const catchup = { called: false, userId: null as number | null };
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
    const pollerSvc = {
        runCatchup: vi.fn().mockImplementation((uid: number) => { catchup.called = true; catchup.userId = uid; return Promise.resolve(); }),
        startPolling: vi.fn().mockResolvedValue(undefined),
    };
    // 2 matches → triggers low-market warning
    const marketSvc = { countMatchesOverWindow: vi.fn().mockResolvedValue({ total: 2 }) };
    return { saved, catchup, userRepo, pollerSvc, marketSvc };
});

vi.mock('../../config/supabase', () => ({ supabase: { from: vi.fn() }, dbSchema: 'flatscanner_dev', INACTIVITY_TIMEOUT_MINUTES: 20160 }));
vi.mock('../../config/admin', () => ({ ADMIN_TELEGRAM_ID: null }));
vi.mock('../../bot/index', () => ({ bot: { api: { sendMessage: vi.fn().mockResolvedValue({ message_id: 9999 }) } } }));
vi.mock('../../repositories/user.repository', () => ({ UserRepository: vi.fn().mockImplementation(() => m.userRepo) }));
vi.mock('../../repositories/alert.repository', () => ({ AlertRepository: vi.fn().mockImplementation(() => ({ hasSentAlert: vi.fn().mockResolvedValue(false), recordAlert: vi.fn().mockResolvedValue(undefined) })) }));
vi.mock('../../services/poller', () => ({ PollingService: vi.fn().mockImplementation(() => m.pollerSvc) }));
vi.mock('../../services/market-check.service', () => ({ MarketCheckService: vi.fn().mockImplementation(() => m.marketSvc) }));

import { ConversationDriver } from './_harness/bot-driver';

const USER_ID = 11111;
// Niche criteria: large apartment, low budget for Geneva, very specific zone
const NICHE_MESSAGE = 'Je cherche un appartement de 5 pièces à Cité-Centre, max 1800 CHF, disponible immédiatement';

function activeUser(id: number) {
    return { telegram_id: id, is_active: true, is_paused: false, onboarding_completed: false, pending_authorization: false, created_at: new Date().toISOString(), last_interaction: new Date().toISOString() };
}

describe('Profile 8 — Picky Perfectionist (low market volume)', () => {
    let driver: ConversationDriver;

    beforeEach(() => {
        m.saved.criteria = null;
        m.catchup.called = false;
        m.catchup.userId = null;
        vi.clearAllMocks();

        m.userRepo.getUser.mockResolvedValue(activeUser(USER_ID));
        m.userRepo.createUser.mockImplementation((d: any) => Promise.resolve(activeUser(d.telegram_id)));
        m.userRepo.getCriteria.mockResolvedValue(null);
        m.userRepo.saveCriteria.mockImplementation((c: any) => { m.saved.criteria = c; return Promise.resolve(true); });
        m.pollerSvc.runCatchup.mockImplementation((uid: number) => { m.catchup.called = true; m.catchup.userId = uid; return Promise.resolve(); });
        m.marketSvc.countMatchesOverWindow.mockResolvedValue({ total: 2 });

        driver = new ConversationDriver({ userId: USER_ID, chatId: USER_ID, languageCode: 'fr' });
    });

    it('shows low-market warning message', async () => {
        await driver.start();
        await driver.sendText(NICHE_MESSAGE);
        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');

        const lowMarketShown = driver.getReplies().some(r =>
            r.includes('strict') || r.includes('seulement') || r.includes('peu') ||
            r.includes('marché') || r.includes('annonce') || r.includes('élargir')
        );
        expect(lowMarketShown).toBe(true);
    }, 60_000);

    it('saves criteria after market_continue despite low volume', async () => {
        await driver.start();
        await driver.sendText(NICHE_MESSAGE);
        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await driver.clickButton('market_continue');
        await new Promise(r => setTimeout(r, 200));

        expect(m.saved.criteria).not.toBeNull();
        expect(m.saved.criteria?.user_id).toBe(USER_ID);
    }, 60_000);

    it('triggers catchup after market_continue', async () => {
        await driver.start();
        await driver.sendText(NICHE_MESSAGE);
        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await driver.clickButton('market_continue');
        await new Promise(r => setTimeout(r, 200));

        expect(m.catchup.called).toBe(true);
    }, 60_000);

    it('shows zero-match warning when market returns 0', async () => {
        m.marketSvc.countMatchesOverWindow.mockResolvedValue({ total: 0 });

        await driver.start();
        await driver.sendText(NICHE_MESSAGE);
        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');

        const emptyShown = driver.getReplies().some(r =>
            r.includes('aucune') || r.includes('élargir') || r.includes('0 annonce')
        );
        expect(emptyShown).toBe(true);
    }, 60_000);
});
