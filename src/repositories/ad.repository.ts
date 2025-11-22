import { supabase } from '../config/supabase';
import { Ad } from '../types/database';

export class AdRepository {
    async getRecentAds(hours: number = 48): Promise<Ad[]> {
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('fb_annonces_location')
            .select('*')
            .gt('created_at', cutoff)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching recent ads:', error);
            return [];
        }
        return data || [];
    }

    async getAdById(id: number): Promise<Ad | null> {
        const { data, error } = await supabase
            .from('fb_annonces_location')
            .select('*')
            .eq('id', id)
            .single();

        if (error) return null;
        return data;
    }
}
