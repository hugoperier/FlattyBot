import { supabase } from '../config/supabase';
import { User, UserCriteria } from '../types/database';

export class UserRepository {
    async createUser(telegramId: number): Promise<User | null> {
        const { data, error } = await supabase
            .from('users')
            .upsert({
                telegram_id: telegramId,
                last_interaction: new Date().toISOString(),
                pending_authorization: true
            })
            .select()
            .single();

        if (error) {
            console.error('Error creating user:', error);
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

