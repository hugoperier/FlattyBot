/**
 * Profile 10 — The Give-Up User
 *
 * 4 vague messages → extractionRounds >= 4 → ONBOARDING_FALLBACK.
 * Tests both fallback_continue (proceed to recap) and fallback_restart (reset to welcome).
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
    const marketSvc = { countMatchesOverWindow: vi.fn().mockResolvedValue({ total: 5 }) };
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

const USER_ID = 99999;

// 4 deliberately vague messages — no numbers, no zones → criteres_manquants should stay non-empty
const VAGUE_MESSAGES = [
    'Je cherche un logement',
    'Quelque chose de bien',
    'Je sais pas trop',
    'Peu importe en fait',
];

function activeUser(id: number) {
    return { telegram_id: id, is_active: true, is_paused: false, onboarding_completed: false, pending_authorization: false, created_at: new Date().toISOString(), last_interaction: new Date().toISOString() };
}

async function runToFallback(driver: ConversationDriver) {
    await driver.start();
    for (const msg of VAGUE_MESSAGES) {
        await driver.sendText(msg);
    }
}

describe('Profile 10 — Give-Up User (fallback after 4 rounds)', () => {
    let driver: ConversationDriver;

    beforeEach(() => {
        m.saved.criteria = null;
        vi.clearAllMocks();
        m.userRepo.getUser.mockResolvedValue(activeUser(USER_ID));
        m.userRepo.createUser.mockImplementation((d: any) => Promise.resolve(activeUser(d.telegram_id)));
        m.userRepo.getCriteria.mockResolvedValue(null);
        m.userRepo.saveCriteria.mockImplementation((c: any) => { m.saved.criteria = c; return Promise.resolve(true); });
        m.pollerSvc.runCatchup.mockResolvedValue(undefined);
        m.marketSvc.countMatchesOverWindow.mockResolvedValue({ total: 5 });

        driver = new ConversationDriver({ userId: USER_ID, chatId: USER_ID, languageCode: 'fr' });
    });

    it('shows fallback message after 4 vague inputs', async () => {
        await runToFallback(driver);

        const fallbackShown = driver.getReplies().some(r =>
            r.includes('mal à obtenir') || r.includes('trouble') ||
            r.includes('Continuer quand même') || r.includes('Tout recommencer')
        );
        expect(fallbackShown).toBe(true);
    }, 120_000);

    it('branch A: fallback_continue shows recap', async () => {
        await runToFallback(driver);
        await driver.clickButton('fallback_continue');

        const recapShown = driver.getReplies().some(r =>
            r.includes('Confirmer') || r.includes('Récapitulatif') || r.includes('Modifier')
        );
        expect(recapShown).toBe(true);
    }, 120_000);

    it('branch A: fallback_continue → confirm → saves criteria', async () => {
        await runToFallback(driver);
        await driver.clickButton('fallback_continue');
        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await new Promise(r => setTimeout(r, 300));

        expect(m.saved.criteria?.user_id).toBe(USER_ID);
    }, 120_000);

    it('branch B: fallback_restart sends welcome message again', async () => {
        await runToFallback(driver);
        await driver.clickButton('fallback_restart');

        const replies = driver.getReplies();
        const resetConfirmed = replies.some(r =>
            r.includes('recommence') || r.includes('start over') || r.includes('reprend')
        );
        const welcomeShown = replies.some(r =>
            r.includes('FlattyBot') || r.includes('surveille') || r.includes('recherche')
        );
        expect(resetConfirmed || welcomeShown).toBe(true);
    }, 120_000);
});
