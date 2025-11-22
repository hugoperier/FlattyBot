import { startBot, bot } from './bot';
import { PollingService } from './services/poller';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
    // Start Telegram Bot
    await startBot();

    // Start Polling Service
    const pollingService = new PollingService();
    // Poll every 3 minutes (180000 ms)
    pollingService.startPolling(180000);

    console.log('🚀 FlattyBot is running!');

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
}

main().catch(console.error);
