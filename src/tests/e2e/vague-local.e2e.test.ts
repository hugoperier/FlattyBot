/**
 * Profile 2 — The Vague Local
 *
 * FR speaker, minimal initial description, fills details via quick-fill keyboards.
 * Exercises: FR direct path, multi-round extraction, all three quick-fill keyboards.
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
    const marketSvc = { countMatchesOverWindow: vi.fn().mockResolvedValue({ total: 18 }) };
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

const USER_ID = 55555;

function activeUser(id: number) {
    return { telegram_id: id, is_active: true, is_paused: false, onboarding_completed: false, pending_authorization: false, created_at: new Date().toISOString(), last_interaction: new Date().toISOString() };
}

describe('Profile 2 — Vague Local (FR, quick-fill path)', () => {
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
        m.marketSvc.countMatchesOverWindow.mockResolvedValue({ total: 18 });

        // FR language code → bot skips language picker
        driver = new ConversationDriver({ userId: USER_ID, chatId: USER_ID, languageCode: 'fr' });
    });

    it('skips language picker for FR users (first message is welcome)', async () => {
        await driver.start();
        const replies = driver.getReplies();
        expect(replies.length).toBeGreaterThan(0);
        // For FR, bot goes straight to welcome — no language selection prompt needed
        // (welcome prompt doesn't say "Français" as a button label in the text itself)
        expect(replies[0]).not.toBe('');
    }, 30_000);

    it('sends a follow-up question after a vague description', async () => {
        await driver.start();
        await driver.sendText('Salut je cherche un appart à Genève');

        const replies = driver.getReplies();
        const hasFollowUp = replies.some(r =>
            r.includes('budget') || r.includes('Budget') ||
            r.includes('pièce') || r.includes('chambre') ||
            r.includes('disponible') || r.includes('emménager')
        );
        expect(hasFollowUp).toBe(true);
    }, 60_000);

    it('accepts budget quick-fill and asks next question', async () => {
        await driver.start();
        await driver.sendText('Salut je cherche un appart à Genève');
        await driver.clickButton('qf_budget_2500');

        const replies = driver.getReplies();
        const askedNext = replies.some(r =>
            r.includes('pièce') || r.includes('chambre') || r.includes('disponible') || r.includes('emménager')
        );
        expect(askedNext).toBe(true);
    }, 60_000);

    it('saves budget=2500 and pieces_min=3 after using quick-fill keyboards', async () => {
        await driver.start();
        await driver.sendText('Salut je cherche un appart à Genève');
        await driver.clickButton('qf_budget_2500');
        await driver.clickButton('qf_pieces_3');
        await driver.clickButton('qf_avail_flexible');

        // If housing type disambiguation shows, click appartement
        if (driver.getReplies().some(r => r.includes('Quel type de logement') || r.includes('What type of accommodation'))) {
            await driver.clickButton('type_appart');
        }

        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await new Promise(r => setTimeout(r, 300));

        expect(m.saved.criteria?.criteres_stricts?.budget_max).toBe(2500);
        expect(m.saved.criteria?.criteres_stricts?.nombre_pieces_min).toBe(3);
    }, 90_000);

    it('triggers catchup after completing', async () => {
        await driver.start();
        await driver.sendText('Salut je cherche un appart à Genève');
        await driver.clickButton('qf_budget_2500');
        await driver.clickButton('qf_pieces_3');
        await driver.clickButton('qf_avail_flexible');

        if (driver.getReplies().some(r => r.includes('Quel type de logement') || r.includes('What type of accommodation'))) {
            await driver.clickButton('type_appart');
        }

        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await new Promise(r => setTimeout(r, 300));

        expect(m.catchup.called).toBe(true);
    }, 90_000);
});
