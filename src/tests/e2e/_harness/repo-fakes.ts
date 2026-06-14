/**
 * In-memory fake implementations of the repositories used during onboarding.
 * Each factory returns a plain object matching the repository's public interface.
 * Tests can spy on these or override per-test via the returned vi.fn() stubs.
 */

import { vi } from 'vitest';
import { UserCriteria } from '../../../types/database';

export interface SavedCriteriaRef {
    value: UserCriteria | null;
}

/** Creates a fake UserRepository whose behaviour can be controlled per-test. */
export function makeFakeUserRepo(savedRef?: SavedCriteriaRef) {
    const activeUser = {
        telegram_id: 0,
        first_name: 'Test',
        is_active: true,
        is_paused: false,
        onboarding_completed: false,
        pending_authorization: false,
        created_at: new Date().toISOString(),
        last_interaction: new Date().toISOString(),
    };

    return {
        getUser: vi.fn().mockResolvedValue({ ...activeUser }),
        createUser: vi.fn().mockImplementation((data: { telegram_id: number }) => {
            return Promise.resolve({ ...activeUser, telegram_id: data.telegram_id });
        }),
        getCriteria: vi.fn().mockResolvedValue(null),
        saveCriteria: vi.fn().mockImplementation((criteria: UserCriteria) => {
            if (savedRef) savedRef.value = criteria;
            return Promise.resolve(true);
        }),
        updateLastInteraction: vi.fn().mockResolvedValue(undefined),
        getAllActiveUsers: vi.fn().mockResolvedValue([]),
        authorizeUser: vi.fn().mockResolvedValue(true),
        getPendingAuthorizationUsers: vi.fn().mockResolvedValue([]),
        deactivateInactiveUsers: vi.fn().mockResolvedValue(0),
    };
}

/** Creates a fake PollingService — catchup is a no-op. */
export function makeFakePollingService(catchupRef?: { called: boolean; userId: number | null }) {
    return {
        runCatchup: vi.fn().mockImplementation((userId: number) => {
            if (catchupRef) {
                catchupRef.called = true;
                catchupRef.userId = userId;
            }
            return Promise.resolve();
        }),
        startPolling: vi.fn().mockResolvedValue(undefined),
    };
}

/** Creates a fake MarketCheckService. `total` controls market-check feedback. */
export function makeFakeMarketCheckService(total = 20) {
    return {
        countMatchesOverWindow: vi.fn().mockResolvedValue({ total }),
    };
}

/** Creates a fake AdAggregationService used by MarketCheckService. */
export function makeFakeAdAggregationService() {
    return {
        getRecentAdsForCatchup: vi.fn().mockResolvedValue([]),
        getAdsForPolling: vi.fn().mockResolvedValue([]),
    };
}
