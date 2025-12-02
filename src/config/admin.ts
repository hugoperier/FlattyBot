// Admin configuration
export const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

// Validate admin configuration at startup
if (!ADMIN_TELEGRAM_ID) {
    console.warn('WARNING: ADMIN_TELEGRAM_ID is not set. Authorization system will not work properly.');
}

export function isAdmin(telegramId: number): boolean {
    return ADMIN_TELEGRAM_ID ? telegramId.toString() === ADMIN_TELEGRAM_ID : false;
}
