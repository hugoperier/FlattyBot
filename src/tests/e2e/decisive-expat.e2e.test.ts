/**
 * Profile 1 — The Decisive Expat
 *
 * English speaker, complete criteria in one message.
 * Exercises: EN language branch, single extraction round, location suggestion
 * (accept all neighbors), market check, full happy path to IDLE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (must precede vi.mock calls) ────────────────────────────────
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
    const marketSvc = { countMatchesOverWindow: vi.fn().mockResolvedValue({ total: 25 }) };
    return { saved, catchup, userRepo, pollerSvc, marketSvc };
});

vi.mock('../../config/supabase', () => ({
    supabase: { from: vi.fn() },
    dbSchema: 'flatscanner_dev',
    INACTIVITY_TIMEOUT_MINUTES: 20160,
}));
vi.mock('../../config/admin', () => ({ ADMIN_TELEGRAM_ID: null }));
vi.mock('../../bot/index', () => ({
    bot: { api: { sendMessage: vi.fn().mockResolvedValue({ message_id: 9999 }) } },
}));
vi.mock('../../repositories/user.repository', () => ({
    UserRepository: vi.fn().mockImplementation(() => m.userRepo),
}));
vi.mock('../../repositories/alert.repository', () => ({
    AlertRepository: vi.fn().mockImplementation(() => ({
        hasSentAlert: vi.fn().mockResolvedValue(false),
        recordAlert: vi.fn().mockResolvedValue(undefined),
    })),
}));
vi.mock('../../services/poller', () => ({
    PollingService: vi.fn().mockImplementation(() => m.pollerSvc),
}));
vi.mock('../../services/market-check.service', () => ({
    MarketCheckService: vi.fn().mockImplementation(() => m.marketSvc),
}));

import { ConversationDriver } from './_harness/bot-driver';

// ── Helpers ───────────────────────────────────────────────────────────────────

function activeUser(userId: number) {
    return {
        telegram_id: userId, is_active: true, is_paused: false,
        onboarding_completed: false, pending_authorization: false,
        created_at: new Date().toISOString(), last_interaction: new Date().toISOString(),
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Profile 1 — Decisive Expat (EN, single-round extraction)', () => {
    let driver: ConversationDriver;
    const USER_ID = 12345;

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
        m.marketSvc.countMatchesOverWindow.mockResolvedValue({ total: 25 });

        driver = new ConversationDriver({ userId: USER_ID, chatId: USER_ID, languageCode: 'en' });
    });

    it('shows language picker for EN users and proceeds after lang_en click', async () => {
        await driver.start();
        // EN language code → bot should show the language selection
        const replies = driver.getReplies();
        expect(replies.length).toBeGreaterThan(0);
        // lang_prompt text: '🌍 Dans quelle langue … Which language do you prefer?'
        const langPromptShown = replies.some(r => r.includes('quelle langue') || r.includes('Which language'));
        expect(langPromptShown).toBe(true);

        await driver.clickButton('lang_en');
        // Welcome message should follow
        const postLang = driver.getReplies();
        expect(postLang.length).toBeGreaterThan(1);
    }, 30_000);

    it('reaches recap after a complete single-message description', async () => {
        await driver.start();
        await driver.clickButton('lang_en');

        await driver.sendText(
            'Looking for a 3-room apartment in Eaux-Vives, max 2500 CHF/month, available in September'
        );

        const hasRecap = driver.getReplies().some(r =>
            r.includes('Search summary') || r.includes('Récapitulatif')
        );
        expect(hasRecap).toBe(true);
    }, 60_000);

    it('saves criteria with the correct user_id after full flow', async () => {
        await driver.start();
        await driver.clickButton('lang_en');
        await driver.sendText(
            'Looking for a 3-room apartment in Eaux-Vives, max 2500 CHF/month, available in September'
        );
        await driver.clickButton('confirm_criteria');
        // Accept proximity suggestions or keep strict — both paths should save
        try { await driver.clickButton('conf_loc_all'); } catch { /* location step may skip */ }
        await new Promise(r => setTimeout(r, 300));

        expect(m.saved.criteria?.user_id).toBe(USER_ID);
    }, 90_000);

    it('triggers catchup for the correct user', async () => {
        await driver.start();
        await driver.clickButton('lang_en');
        await driver.sendText(
            'Looking for a 3-room apartment in Eaux-Vives, max 2500 CHF/month, available in September'
        );
        await driver.clickButton('confirm_criteria');
        try { await driver.clickButton('conf_loc_all'); } catch { /* ok */ }
        await new Promise(r => setTimeout(r, 300));

        expect(m.catchup.called).toBe(true);
        expect(m.catchup.userId).toBe(USER_ID);
    }, 90_000);

    it('extracted criteria contain Eaux-Vives', async () => {
        await driver.start();
        await driver.clickButton('lang_en');
        await driver.sendText(
            'Looking for a 3-room apartment in Eaux-Vives, max 2500 CHF/month, available in September'
        );
        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await new Promise(r => setTimeout(r, 300));

        const zones: string[] = m.saved.criteria?.criteres_stricts?.zones ?? [];
        expect(zones).toContain('Eaux-Vives');
    }, 90_000);
});
