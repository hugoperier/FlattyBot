import { supabase } from '../config/supabase';
import { User, UserCriteria } from '../types/database';

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
        await supabase
            .from('users')
            .update({ last_interaction: new Date().toISOString() })
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
}

