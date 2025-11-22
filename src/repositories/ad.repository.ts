import { supabase } from '../config/supabase';
import { Ad, AdWithPost } from '../types/database';

export class AdRepository {
    /**
     * Get recent ads with their associated Facebook posts in a single query
     * Uses JOIN via the facebook_post_id foreign key relationship
     */
    async getRecentAds(hours: number = 48): Promise<AdWithPost[]> {
        const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        const { data, error } = await supabase
            .from('fb_annonces_location')
            .select(`
                *,
                facebook_posts!inner(*)
            `)
            .gt('created_at', cutoff)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching recent ads:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Get a single ad by ID with its associated Facebook post
     * Uses JOIN via the facebook_post_id foreign key relationship
     */
    async getAdById(id: number): Promise<AdWithPost | null> {
        const { data, error } = await supabase
            .from('fb_annonces_location')
            .select(`
                *,
                facebook_posts!inner(*)
            `)
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching ad by ID:', error);
            return null;
        }
        return data;
    }
}
