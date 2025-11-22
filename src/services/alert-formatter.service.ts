import { supabase } from '../config/supabase';
import { Ad } from '../types/database';
import { ScoreResult } from './scoring.service';
import { FacebookPostRepository } from '../repositories/facebook-post.repository';

export class AlertFormatterService {
    private fbPostRepo: FacebookPostRepository;

    constructor() {
        this.fbPostRepo = new FacebookPostRepository();
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
     * Get the public URL for an image from Supabase bucket
     */
    async getImageUrl(imagePath: string | null): Promise<string | null> {
        if (!imagePath) {
            console.log('No image path provided');
            return null;
        }

        try {
            console.log('Getting image URL for path:', imagePath);

            // Parse the path to handle subdirectories
            const pathParts = imagePath.split('/');
            const fileName = pathParts[pathParts.length - 1];
            const folder = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '';

            console.log('Checking in folder:', folder || '(root)', '- file:', fileName);

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

            console.log('Available files:', fileList?.map(f => f.name).join(', ') || 'none');

            const fileExists = fileList && fileList.some(file => file.name === fileName);

            if (!fileExists) {
                console.warn(`Image not found: ${imagePath}`);
                console.log('Available files:', fileList?.map(f => f.name).join(', ') || 'none');
                return null;
            }

            console.log('Image found ✓');

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
                console.log('Signed URL generated (expires in 1h)');
                return data.signedUrl;
            }
        } catch (error) {
            console.error('Error getting image URL:', error);
        }

        return null;
    }

    /**
     * Get the Facebook mobile permalink for an ad
     */
    async getFacebookLink(ad: Ad): Promise<string> {
        const permalink = await this.fbPostRepo.getMobilePermalink(ad.facebook_post_id);

        if (permalink) {
            return permalink;
        }

        // Fallback to a generic Facebook link
        return `https://www.facebook.com/${ad.facebook_post_id}`;
    }

    /**
     * Format the alert message
     */
    async formatAlertMessage(ad: Ad, score: ScoreResult): Promise<string> {
        const isPremium = score.score_total >= 120;
        let msg = '';

        // Header
        if (isPremium) {
            msg += '🌟 **MATCH PARFAIT** 🌟\n\n';
        } else {
            msg += '🔔 **Nouvelle annonce correspondante**\n\n';
        }

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
        const fbLink = await this.getFacebookLink(ad);
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
