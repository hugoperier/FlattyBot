-- Add authorization fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS pending_authorization BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS authorized_at TIMESTAMPTZ;

-- Update existing users to be authorized (backward compatibility)
UPDATE users 
SET pending_authorization = FALSE, 
    authorized_at = created_at 
WHERE pending_authorization IS NULL OR pending_authorization = TRUE;
