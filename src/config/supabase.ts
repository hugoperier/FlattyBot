import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const env = process.env.NODE_ENV ?? "development";
dotenv.config({ path: `.env.${env}` });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const dbSchema = process.env.DB_SCHEMA ?? 'flatscanner_dev';

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_KEY environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
    db: {
        schema: dbSchema
    }
});

export { dbSchema };
