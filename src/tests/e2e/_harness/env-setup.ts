/**
 * Loaded as a vitest setupFile for E2E tests. Sets required env vars before
 * any module (OpenAI client, Supabase client) is instantiated.
 *
 * This must run before modules are imported because several services
 * create API clients at module-load time.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.development') });

// Provide test-safe fallbacks so module-level guards don't throw even when
// the actual services are mocked (which they are in all E2E tests).
if (!process.env.TELEGRAM_BOT_TOKEN) {
    process.env.TELEGRAM_BOT_TOKEN = 'test:placeholder_token';
}
if (!process.env.SUPABASE_URL) {
    process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
}
if (!process.env.SUPABASE_KEY) {
    process.env.SUPABASE_KEY = 'placeholder-supabase-key';
}
if (!process.env.DB_SCHEMA) {
    process.env.DB_SCHEMA = 'flatscanner_dev';
}
// OPENAI_API_KEY must come from .env.development — E2E tests call the real API.
// If it's still unset after dotenv.config, let OpenAI throw a clear error rather
// than a silent wrong-value failure.
