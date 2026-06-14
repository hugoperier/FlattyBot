/**
 * Builds minimal valid Grammy Update objects for feeding into bot.handleUpdate.
 * Auto-increments IDs so each call produces a unique update.
 */

let _updateId = 1000;
let _messageId = 2000;

function nextUpdateId() { return ++_updateId; }
function nextMessageId() { return ++_messageId; }

export function resetCounters() {
    _updateId = 1000;
    _messageId = 2000;
}

function baseUser(userId: number, languageCode = 'fr') {
    return { id: userId, is_bot: false, first_name: 'Test', username: 'testuser', language_code: languageCode };
}

function baseChat(chatId: number) {
    return { id: chatId, type: 'private' as const, first_name: 'Test' };
}

export function makeTextUpdate(chatId: number, userId: number, text: string, languageCode = 'fr') {
    return {
        update_id: nextUpdateId(),
        message: {
            message_id: nextMessageId(),
            date: Math.floor(Date.now() / 1000),
            chat: baseChat(chatId),
            from: baseUser(userId, languageCode),
            text,
        },
    };
}

export function makeCommandUpdate(chatId: number, userId: number, command: string, languageCode = 'fr') {
    const text = `/${command}`;
    return {
        update_id: nextUpdateId(),
        message: {
            message_id: nextMessageId(),
            date: Math.floor(Date.now() / 1000),
            chat: baseChat(chatId),
            from: baseUser(userId, languageCode),
            text,
            // Grammy's bot.command() filter requires a bot_command entity
            entities: [{ offset: 0, length: text.length, type: 'bot_command' as const }],
        },
    };
}

export function makeCallbackUpdate(chatId: number, userId: number, data: string, languageCode = 'fr') {
    return {
        update_id: nextUpdateId(),
        callback_query: {
            id: String(nextUpdateId()),
            from: baseUser(userId, languageCode),
            data,
            chat_instance: String(chatId),
            message: {
                message_id: nextMessageId(),
                date: Math.floor(Date.now() / 1000),
                chat: baseChat(chatId),
                from: { id: 99, is_bot: true, first_name: 'FlattyBot', username: 'flattybot' },
                text: '[keyboard message]',
            },
        },
    };
}
