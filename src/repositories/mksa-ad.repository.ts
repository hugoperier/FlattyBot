import { supabase } from '../config/supabase';

/**
 * Raw shape of a row in flatscanner.mksa_annonces (or <dbSchema>.mksa_annonces).
 * We only model the fields we actually use in the bot.
 */
export interface MksaAnnonce {
    id: string; // UUID
    title: string | null;
    monthly_gross_price: number | null;
    monthly_charges: number | null;
    monthly_net_price: number | null;
    monthly_price: number | null;
    description: string | null;
    surface_m2: number | null;
    available_date: string | null; // DATE in ISO format
    number_rooms: number | null;
    address: string | null;
    car_park: boolean | null;
    created_at: string;
    source_url: string | null;
    /**
     * Column is JSONB. Supabase usually returns a parsed JS value:
     * - `string[]` for JSON arrays
     * - sometimes `string` in exports/samples (CSV) or if stored inconsistently
     */
    image_urls: string[] | string | null;
    listing_type: string | null;
    latitude: number | null;
    longitude: number | null;
    currency: string | null;
    transaction_type: string | null;
    balcony: boolean | null;
    land_surface_m2: number | null;
    sale_price: number | null;
    is_user_listing: boolean | null;
    regie: string | null;
}

export class MksaAdRepository {
    /**
     * Fetch MKSA ads that have been created after the given ISO timestamp.
     *
     * This is intentionally "since last seen" based to avoid spamming users
     * with the même annonces à chaque cycle de polling, without introducing
     * new DB tables for per-user tracking.
     */
    async getAdsSince(createdAfterIso: string): Promise<MksaAnnonce[]> {
        const { data, error } = await supabase
            .from('mksa_annonces')
            .select('*')
            .eq('transaction_type', 'rental')
            .gt('created_at', createdAfterIso)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching MKSA ads:', error);
            return [];
        }

        return (data as MksaAnnonce[]) || [];
    }
}

