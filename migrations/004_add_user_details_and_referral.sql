-- Add user details and referral tracking
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS language_code TEXT,
ADD COLUMN IF NOT EXISTS referral_code TEXT;

-- Index for referral tracking
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
