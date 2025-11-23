import { supabase } from '../config/supabase';
import { AdWithPost } from '../types/database';
import { ScoreResult } from './scoring.service';

export class AlertFormatterService {
    constructor() {
        // No dependencies needed - we use joined data
    }

    /**
     * Format a value, returning a default if null/undefined
     */
    private formatValue(value: any, defaultValue: string = 'Non communiqué'): string {
        if (value === null || value === undefined || value === '') {
            return defaultValue;
        }
        return String(value);
    }

    /**
     * Format time_posted to relative time in French (UX-friendly)
     * Converts "2025-11-20 12:48:27.649244+00" to "il y a 2 jours" or "20 nov. 2025 à 12h48"
     */
    private formatTimePosted(timePosted: string): string {
        try {
            const posted = new Date(timePosted);
            const now = new Date();
            const diffMs = now.getTime() - posted.getTime();
            const diffMinutes = Math.floor(diffMs / (1000 * 60));
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            // Less than 1 hour: "il y a X minutes"
            if (diffMinutes < 60) {
                if (diffMinutes < 1) return 'À l\'instant';
                if (diffMinutes === 1) return 'il y a 1 minute';
                return `il y a ${diffMinutes} minutes`;
            }

            // Less than 24 hours: "il y a X heures"
            if (diffHours < 24) {
                if (diffHours === 1) return 'il y a 1 heure';
                return `il y a ${diffHours} heures`;
            }

            // Less than 7 days: "il y a X jours"
            if (diffDays < 7) {
                if (diffDays === 1) return 'il y a 1 jour';
                return `il y a ${diffDays} jours`;
            }

            // 7+ days: show exact date and time
            const months = [
                'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'
            ];
            const day = posted.getDate();
            const month = months[posted.getMonth()];
            const year = posted.getFullYear();
            const hours = posted.getHours().toString().padStart(2, '0');
            const minutes = posted.getMinutes().toString().padStart(2, '0');

            return `${day} ${month} ${year} à ${hours}h${minutes}`;
        } catch (error) {
            console.error('Error formatting time_posted:', error);
            return 'Date inconnue';
        }
    }

    /**
     * Get the public URL for an image from Supabase bucket
     */
    async getImageUrl(imagePath: string | null): Promise<string | null> {
        if (!imagePath) {
            console.log('No image path provided');
            return null;
        }

        try {
            // Parse the path to handle subdirectories
            const pathParts = imagePath.split('/');
            const fileName = pathParts[pathParts.length - 1];
            const folder = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';

            // List files in the specific folder (without search parameter)
            const { data: fileList, error: listError } = await supabase.storage
                .from('annonces_images')
                .list(folder, {
                    limit: 500
                });

            if (listError) {
                console.error('Error listing files:', listError);
                return null;
            }

            const fileExists = fileList && fileList.some(file => file.name === fileName);

            if (!fileExists) {
                console.warn(`Image not found: ${imagePath}`);
                return null;
            }

            // File exists, create a signed URL (works with private bucket)
            // URL expires after 7 days (604800 seconds) - user can view old messages
            const { data, error: signError } = await supabase.storage
                .from('annonces_images')
                .createSignedUrl(imagePath, 604800);

            if (signError) {
                console.error('Error creating signed URL:', signError);
                return null;
            }

            if (data?.signedUrl) {
                return data.signedUrl;
            }
        } catch (error) {
            console.error('Error getting image URL:', error);
        }

        return null;
    }

    /**
     * Get the Facebook mobile permalink for an ad
     * Uses the joined facebook_posts data - MUST exist due to INNER JOIN
     */
    getFacebookLink(ad: AdWithPost): string {
        // The relation guarantees this exists (INNER JOIN)
        const permalink = ad.facebook_posts.input_data?.permalink?.mobile;

        if (permalink) {
            return permalink;
        }

        // Fallback to canonical or raw permalink if mobile not available
        return ad.facebook_posts.input_data?.permalink?.canonical ||
            ad.facebook_posts.input_data?.permalink?.raw ||
            `https://www.facebook.com/${ad.facebook_posts.post_id}`;
    }

    /**
     * Format the alert message
     */
    async formatAlertMessage(ad: AdWithPost, score: ScoreResult): Promise<string> {
        const isPremium = score.score_total >= 120;
        let msg = '';

        // Header
        if (isPremium) {
            msg += '🌟 **MATCH PARFAIT** 🌟\n\n';
        } else {
            msg += '🔔 **Nouvelle annonce correspondante**\n\n';
        }

        // Time posted
        const timePosted = this.formatTimePosted(ad.facebook_posts.time_posted);
        msg += `🕒 Publié ${timePosted}\n\n`;

        // Property details
        const type = this.formatValue(ad.type_logement, 'Logement');
        const pieces = ad.nombre_pieces
            ? `${ad.nombre_pieces} pièce${ad.nombre_pieces > 1 ? 's' : ''}`
            : 'Nombre de pièces non communiqué';
        const surface = ad.surface_m2
            ? `${ad.surface_m2}m²`
            : '';

        msg += `🏠 **${type}** - ${pieces}`;
        if (surface) {
            msg += ` - ${surface}`;
        }
        msg += '\n';

        // Location
        const quartier = ad.quartier ? `${ad.quartier}, ` : '';
        const codePostal = this.formatValue(ad.code_postal, '');
        const ville = this.formatValue(ad.ville, 'Genève');
        const adresse = ad.adresse_complete || 'Adresse non communiquée';

        msg += `📍 ${quartier}${codePostal} ${ville}\n`;
        if (adresse !== 'Adresse non communiquée') {
            msg += `   ${adresse}\n`;
        }

        // Price
        const prix = ad.loyer_total
            ? `**${ad.loyer_total} CHF/mois**`
            : '**Prix à discuter**';
        msg += `💰 ${prix}\n\n`;

        // Badges
        if (score.badges.length > 0) {
            msg += `${score.badges.join(' ')}\n\n`;
        }

        // Comfort criteria matches
        if (score.criteres_confort_matches.length > 0) {
            msg += `✅ **Bonus:** ${score.criteres_confort_matches.join(', ')}\n\n`;
        }

        // Additional info (if available)
        const additionalInfo: string[] = [];

        if (ad.balcon) additionalInfo.push('🌿 Balcon');
        if (ad.terrasse) additionalInfo.push('🌿 Terrasse');
        if (ad.parking_inclus) additionalInfo.push('🚗 Parking');
        if (ad.meuble) additionalInfo.push('🛋️ Meublé');
        if (ad.dernier_etage) additionalInfo.push('🔝 Dernier étage');

        if (additionalInfo.length > 0) {
            msg += `${additionalInfo.join(' • ')}\n\n`;
        }

        // Availability
        if (ad.date_disponibilite) {
            const disponibilite = new Date(ad.date_disponibilite).toLocaleDateString('fr-FR');
            msg += `📅 Disponible à partir du ${disponibilite}\n`;
        }

        if (ad.urgence) {
            msg += `⚡ **URGENT** - À pourvoir rapidement\n`;
        }

        // Facebook link
        const fbLink = this.getFacebookLink(ad);
        msg += `\n[👉 Voir l'annonce sur Facebook](${fbLink})`;

        return msg;
    }

    /**
     * Check if image exists in bucket
     */
    async hasValidImage(imagePath: string | null): Promise<boolean> {
        if (!imagePath) return false;

        try {
            const { data, error } = await supabase.storage
                .from('annonces_images')
                .list('', {
                    search: imagePath
                });

            return !error && data && data.length > 0;
        } catch (error) {
            console.error('Error checking image existence:', error);
            return false;
        }
    }
}
