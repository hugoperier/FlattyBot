import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/tests/e2e/**/*.e2e.test.ts'],
        setupFiles: ['src/tests/e2e/_harness/env-setup.ts'],
        testTimeout: 120_000,
        hookTimeout: 30_000,
        // E2E tests are intentionally sequential — parallel runs would share the
        // same module registry and cause mock interference between profiles.
        pool: 'forks',
        poolOptions: {
            forks: { singleFork: true },
        },
        coverage: {
            enabled: false,
        },
    },
});
