/**
 * Profile 9 — The Corrector
 *
 * User hits "Modify" at recap, changes budget. Verifies re-extraction merges correctly.
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
    const marketSvc = { countMatchesOverWindow: vi.fn().mockResolvedValue({ total: 20 }) };
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

const USER_ID = 22222;

function activeUser(id: number) {
    return { telegram_id: id, is_active: true, is_paused: false, onboarding_completed: false, pending_authorization: false, created_at: new Date().toISOString(), last_interaction: new Date().toISOString() };
}

describe('Profile 9 — The Corrector (modify at recap, re-extract + merge)', () => {
    let driver: ConversationDriver;

    beforeEach(() => {
        m.saved.criteria = null;
        vi.clearAllMocks();
        m.userRepo.getUser.mockResolvedValue(activeUser(USER_ID));
        m.userRepo.createUser.mockImplementation((d: any) => Promise.resolve(activeUser(d.telegram_id)));
        m.userRepo.getCriteria.mockResolvedValue(null);
        m.userRepo.saveCriteria.mockImplementation((c: any) => { m.saved.criteria = c; return Promise.resolve(true); });
        m.pollerSvc.runCatchup.mockResolvedValue(undefined);
        m.marketSvc.countMatchesOverWindow.mockResolvedValue({ total: 20 });

        driver = new ConversationDriver({ userId: USER_ID, chatId: USER_ID, languageCode: 'fr' });
    });

    it('shows modify prompt when modify_criteria is clicked', async () => {
        await driver.start();
        await driver.sendText('Appartement à Eaux-Vives, 2 pièces, budget 2000 CHF, disponible maintenant');
        await driver.clickButton('modify_criteria');

        const modifyShown = driver.getReplies().some(r =>
            r.includes('modifier') || r.includes('Modifier') || r.includes('changer')
        );
        expect(modifyShown).toBe(true);
    }, 60_000);

    it('updates budget to 2500 after correction', async () => {
        await driver.start();
        await driver.sendText('Appartement à Eaux-Vives, 2 pièces, budget 2000 CHF, disponible maintenant');
        await driver.clickButton('modify_criteria');
        await driver.sendText('Monte le budget à 2500 CHF');
        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await new Promise(r => setTimeout(r, 200));

        expect(m.saved.criteria?.criteres_stricts?.budget_max).toBe(2500);
    }, 90_000);

    it('preserves zone after budget correction (merge invariant)', async () => {
        await driver.start();
        await driver.sendText('Appartement à Eaux-Vives, 2 pièces, budget 2000 CHF, disponible maintenant');
        await driver.clickButton('modify_criteria');
        await driver.sendText('Monte le budget à 2500 CHF');
        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await new Promise(r => setTimeout(r, 200));

        const zones: string[] = m.saved.criteria?.criteres_stricts?.zones ?? [];
        expect(zones).toContain('Eaux-Vives');
    }, 90_000);

    it('shows updated budget in the second recap message', async () => {
        await driver.start();
        await driver.sendText('Appartement à Eaux-Vives, 2 pièces, budget 2000 CHF, disponible maintenant');
        await driver.clickButton('modify_criteria');
        await driver.sendText('Monte le budget à 2500 CHF');

        const replies = driver.getReplies();
        const updatedBudgetShown = replies.some(r =>
            r.includes('2 500') || r.includes('2500') || r.includes('2\'500')
        );
        expect(updatedBudgetShown).toBe(true);
    }, 90_000);
});
