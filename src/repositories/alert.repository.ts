import { supabase } from '../config/supabase';
import { SentAlert } from '../types/database';
import { AdSource } from '../services/ad-aggregation.service';

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

    /**
     * Check if an alert has already been sent to a user for a given adI
     * Uses (user_id, source, annonce_id) for deduplication across sources.
     */
    async hasAlertBeenSent(userId: number, adId: string | number, source: AdSource): Promise<boolean> {
        const { data, error } = await supabase
            .from('sent_alerts')
            .select('id')
            .eq('user_id', userId)
            .eq('source', source)
            .eq('annonce_id', adId)
            .maybeSingle();

        if (error) {
            console.error('Error checking sent alert:', error);
            return false;
        }

        return !!data;
    }

    /**
     * Get alerts for a user. By default returns only Facebook alerts (for view_alerts
     * which fetches ad details from fb_annonces_location). Pass source: 'all' to get both.
     */
    async getUserAlerts(userId: number, limit: number = 10, source: AdSource | 'all' = 'facebook'): Promise<SentAlert[]> {
        let query = supabase
            .from('sent_alerts')
            .select('*')
            .eq('user_id', userId)
            .order('sent_at', { ascending: false })
            .limit(limit);

        if (source !== 'all') {
            query = query.eq('source', source);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching user alerts:', error);
            return [];
        }
        return data || [];
    }
}
