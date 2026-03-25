import { supabase } from '../config/supabase';
import { User, UserCriteria } from '../types/database';
import { bot } from '../bot';
import { InlineKeyboard } from 'grammy';

export class UserRepository {
    async createUser(userData: {
        telegram_id: number;
        first_name?: string;
        last_name?: string;
        username?: string;
        language_code?: string;
        referral_code?: string;
    }): Promise<User | null> {
        // Check if user exists to preserve authorization status
        const { data: existingUser } = await supabase
            .from('users')
            .select('pending_authorization')
            .eq('telegram_id', userData.telegram_id)
            .single();

        const upsertData: any = {
            ...userData,
            last_interaction: new Date().toISOString()
        };

        // Only set pending_authorization to true for new users
        if (!existingUser) {
            upsertData.pending_authorization = true;
        }

        const { data, error } = await supabase
            .from('users')
            .upsert(upsertData)
            .select()
            .single();

        if (error) {
            console.error('Error creating/updating user:', error);
            return null;
        }
        return data;
    }

    async getUser(telegramId: number): Promise<User | null> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', telegramId)
            .single();

        if (error) return null;
        return data;
    }

    async updateLastInteraction(telegramId: number) {
        // Also restore is_active in case the user was auto-deactivated for inactivity
        await supabase
            .from('users')
            .update({
                last_interaction: new Date().toISOString(),
                is_active: true
            })
            .eq('telegram_id', telegramId);
    }

    async saveCriteria(criteria: UserCriteria): Promise<boolean> {
        const { error } = await supabase
            .from('user_criteria')
            .upsert(criteria);

        if (error) {
            console.error('Error saving criteria:', error);
            return false;
        }

        // Mark onboarding as completed
        await supabase
            .from('users')
            .update({ onboarding_completed: true })
            .eq('telegram_id', criteria.user_id);

        return true;
    }

    async getCriteria(userId: number): Promise<UserCriteria | null> {
        const { data, error } = await supabase
            .from('user_criteria')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) return null;
        return data;
    }

    async getAllActiveUsers(): Promise<User[]> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('is_active', true)
            .eq('is_paused', false)
            .eq('onboarding_completed', true);

        if (error) {
            console.error('Error fetching active users:', error);
            return [];
        }
        return data || [];
    }

    async authorizeUser(telegramId: number): Promise<boolean> {
        const { error } = await supabase
            .from('users')
            .update({
                pending_authorization: false,
                authorized_at: new Date().toISOString()
            })
            .eq('telegram_id', telegramId);

        if (error) {
            console.error('Error authorizing user:', error);
            return false;
        }
        return true;
    }

    async getPendingAuthorizationUsers(): Promise<User[]> {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('pending_authorization', true);

        if (error) {
            console.error('Error fetching pending authorization users:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Marks as inactive all users whose last_interaction is older than
     * thresholdMinutes, then sends each of them a Telegram notification
     * (skipping users who are already paused, since they opted out voluntarily).
     *
     * Returns the number of users that were deactivated.
     */
    async deactivateInactiveUsers(thresholdMinutes: number): Promise<number> {
        const cutoff = new Date(Date.now() - thresholdMinutes * 60 * 1000).toISOString();

        // Fetch users to deactivate: active, not paused, and not recently interacted
        const { data: staleUsers, error } = await supabase
            .from('users')
            .select('telegram_id, is_paused')
            .eq('is_active', true)
            .eq('onboarding_completed', true)
            .lt('last_interaction', cutoff);

        if (error) {
            console.error('[Inactivity] Error fetching stale users:', error);
            return 0;
        }

        if (!staleUsers || staleUsers.length === 0) return 0;

        const telegramIds = staleUsers.map((u) => u.telegram_id);

        // Bulk deactivation
        const { error: updateError } = await supabase
            .from('users')
            .update({ is_active: false })
            .in('telegram_id', telegramIds);

        if (updateError) {
            console.error('[Inactivity] Error deactivating users:', updateError);
            return 0;
        }

        console.log(`[Inactivity] Deactivated ${telegramIds.length} user(s) for inactivity.`);

        // Notify each user — skip paused ones (they opted out voluntarily)
        for (const user of staleUsers) {
            if (user.is_paused) continue;

            try {
                const keyboard = new InlineKeyboard()
                    .text('🔄 Réactiver mes alertes', 'reactivate_alerts').row()
                    .text('📋 Voir le menu', 'back_to_menu');

                await bot.api.sendMessage(
                    user.telegram_id,
                    '😴 *Tes alertes ont été suspendues*\n\n' +
                    'Tu ne t\'es pas connecté depuis un moment, alors j\'ai mis tes alertes en veille pour ne pas te déranger.\n\n' +
                    'Appuie sur le bouton ci-dessous pour les réactiver ! 👇',
                    { parse_mode: 'Markdown', reply_markup: keyboard }
                );
            } catch (sendError) {
                console.error(`[Inactivity] Failed to notify user ${user.telegram_id}:`, sendError);
            }
        }

        return telegramIds.length;
    }
}

