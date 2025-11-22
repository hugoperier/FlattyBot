import { supabase } from '../config/supabase';
import { SentAlert } from '../types/database';

export class AlertRepository {
    async saveAlert(alert: SentAlert): Promise<boolean> {
        const { error } = await supabase
            .from('sent_alerts')
            .insert(alert);

        if (error) {
            console.error('Error saving alert:', error);
            return false;
        }
        return true;
    }

    async hasAlertBeenSent(userId: number, adId: number): Promise<boolean> {
        const { data, error } = await supabase
            .from('sent_alerts')
            .select('id')
            .eq('user_id', userId)
            .eq('annonce_id', adId)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "The result contains 0 rows"
            console.error('Error checking sent alert:', error);
        }

        return !!data;
    }

    async getUserAlerts(userId: number, limit: number = 10): Promise<SentAlert[]> {
        const { data, error } = await supabase
            .from('sent_alerts')
            .select('*')
            .eq('user_id', userId)
            .order('sent_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching user alerts:', error);
            return [];
        }
        return data || [];
    }
}
