import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/tests/**/*.test.ts'],
        exclude: [
            '**/node_modules/**',
            'src/tests/**/*.integration.test.ts',
            'src/tests/**/*.e2e.test.ts',
        ],
        passWithNoTests: true,
        coverage: {
            provider: 'v8',
            include: ['src/services/**', 'src/repositories/**', 'src/utils/**'],
            exclude: ['src/tests/**'],
        },
    },
});
