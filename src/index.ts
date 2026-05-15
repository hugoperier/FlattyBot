import './config/env'; // side-effect only: loads dotenv before other modules
import { startBot, bot } from './bot';
import { PollingService } from './services/poller';
import { dbSchema } from './config/supabase';

async function main() {
    // Start Polling Service BEFORE bot (bot.start() is blocking)
    const pollingService = new PollingService();
    pollingService.startPolling(180000); // Poll every 3 minutes

    console.log(`🚀 FlattyBot is running! Environment: ${process.env.NODE_ENV}, Schema: ${dbSchema}`);

    // Graceful shutdown
    process.once('SIGINT', () => {
        console.log('Stopping bot...');
        bot.stop();
        process.exit(0);
    });
    process.once('SIGTERM', () => {
        console.log('Stopping bot...');
        bot.stop();
        process.exit(0);
    });

    // Start Telegram Bot (this call is blocking)
    await startBot();
}

main().catch(console.error);
