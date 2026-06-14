/**
 * Profile 5 — The Unknown-Zone Seeker
 *
 * User mentions a zone not in known_locations.json → ONBOARDING_WAITING_LOCATION_CLARIFICATION.
 * After clarification with a valid zone, flow continues normally.
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
    const marketSvc = { countMatchesOverWindow: vi.fn().mockResolvedValue({ total: 15 }) };
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

const USER_ID = 77777;
// Champ-Dollon is a prison area, definitively not in known_locations.json
const UNKNOWN_ZONE_MESSAGE = 'Appartement à Champ-Dollon, budget 2000 CHF, 2 pièces, disponible maintenant';

function activeUser(id: number) {
    return { telegram_id: id, is_active: true, is_paused: false, onboarding_completed: false, pending_authorization: false, created_at: new Date().toISOString(), last_interaction: new Date().toISOString() };
}

describe('Profile 5 — Unknown-Zone Seeker', () => {
    let driver: ConversationDriver;

    beforeEach(() => {
        m.saved.criteria = null;
        vi.clearAllMocks();
        m.userRepo.getUser.mockResolvedValue(activeUser(USER_ID));
        m.userRepo.createUser.mockImplementation((d: any) => Promise.resolve(activeUser(d.telegram_id)));
        m.userRepo.getCriteria.mockResolvedValue(null);
        m.userRepo.saveCriteria.mockImplementation((c: any) => { m.saved.criteria = c; return Promise.resolve(true); });
        m.pollerSvc.runCatchup.mockResolvedValue(undefined);
        m.marketSvc.countMatchesOverWindow.mockResolvedValue({ total: 15 });

        driver = new ConversationDriver({ userId: USER_ID, chatId: USER_ID, languageCode: 'fr' });
    });

    it('sends unknown-zone warning when zone is not in known_locations.json', async () => {
        await driver.start();
        await driver.sendText(UNKNOWN_ZONE_MESSAGE);
        await driver.clickButton('confirm_criteria');

        const unknownMsgShown = driver.getReplies().some(r =>
            r.includes('inconnu') || r.includes('unknown') ||
            r.includes('connais pas') || r.includes('orthographe') || r.includes('Lieu')
        );
        expect(unknownMsgShown).toBe(true);
    }, 60_000);

    it('continues flow after user clarifies with a valid zone', async () => {
        await driver.start();
        await driver.sendText(UNKNOWN_ZONE_MESSAGE);
        await driver.clickButton('confirm_criteria');

        // Clarify with a real canonical zone
        await driver.sendText('Carouge');
        // After clarification, extraction re-runs and shows a new recap → confirm again
        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await new Promise(r => setTimeout(r, 200));

        // Should have saved criteria without the unknown zone
        const zones: string[] = m.saved.criteria?.criteres_stricts?.zones ?? [];
        expect(zones).not.toContain('Champ-Dollon');
        expect(zones.some((z: string) => z.toLowerCase().includes('carouge'))).toBe(true);
    }, 90_000);

    it('does not persist the unknown zone in final saved criteria', async () => {
        await driver.start();
        await driver.sendText(UNKNOWN_ZONE_MESSAGE);
        await driver.clickButton('confirm_criteria');
        await driver.sendText('Plainpalais');
        // After clarification, extraction re-runs and shows a new recap → confirm again
        await driver.clickButton('confirm_criteria');
        await driver.clickButton('conf_loc_strict');
        await new Promise(r => setTimeout(r, 200));

        const zones: string[] = m.saved.criteria?.criteres_stricts?.zones ?? [];
        expect(zones).not.toContain('Champ-Dollon');
    }, 90_000);
});
