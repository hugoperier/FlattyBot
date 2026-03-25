import { supabase } from '../config/supabase';
import { Ad, AdWithPost } from '../types/database';
import { ScoreResult } from './scoring.service';
import { AgencyAd } from '../repositories/agency-ad.repository';

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
     * Get the public URL for a Facebook image stored in Supabase bucket.
     */
    async getFacebookImageUrl(imagePath: string | null): Promise<string | null> {
        if (!imagePath) {
            return null;
        }

        try {
            // No need to list files first, createSignedUrl will return 
            // an error if the file doesn't exist.
            // This also avoids the 500-file limit from .list()
            const { data, error } = await supabase.storage
                .from('annonces_images')
                .createSignedUrl(imagePath, 604800);

            if (error) {
                if (error.message === 'Object not found') {
                    console.warn(`Image not found in storage: ${imagePath}`);
                } else {
                    console.error('Error creating signed URL:', error);
                }
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
     * For Agency ads, we use the first external image URL if available.
     */
    getAgencyImageUrl(ad: AgencyAd): string | null {
        if (!ad.image_urls) return null;

        // Supabase JSONB typically returns an array already
        if (Array.isArray(ad.image_urls)) {
            const first = ad.image_urls[0];
            return typeof first === 'string' ? first : null;
        }

        if (typeof ad.image_urls !== 'string') return null;

        const raw = ad.image_urls.trim();
        if (!raw) return null;

        // Sample data shows JSON stringified arrays in CSV exports.
        if (raw.startsWith('[')) {
            try {
                const parsed = JSON.parse(raw) as unknown;
                if (Array.isArray(parsed)) {
                    const first = parsed[0];
                    return typeof first === 'string' ? first : null;
                }
            } catch {
                // fall through
            }
        }

        // Fallback: CSV-style split (legacy / inconsistent storage)
        const first = raw.split(',')[0]?.trim();
        return first || null;
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
     * Build the address following specific rules:
     * 1. Street + Number (if both exist) + optionally District
     * 2. Zip code (fallback)
     * 3. City (fallback)
     */
    private buildAddress(ad: AdWithPost): string | null {
        // 1: Numero de rue et rue (si les deux sont definis)
        if (ad.rue && ad.numero_rue) {
            let addr = `${ad.rue} ${ad.numero_rue}`;

            // Suivi du quartier (si lui aussi defini)
            if (ad.quartier) {
                addr += `, ${ad.quartier}`;
            }

            // Add city if defined (no default)
            if (ad.ville) {
                addr += `, ${ad.ville}`;
            }

            return addr;
        }

        // 2: Quartier - Ville (Requested fallback)
        if (ad.quartier) {
            let addr = ad.quartier;
            // Add city if defined and not redundant
            if (ad.ville && ad.ville.toLowerCase() !== ad.quartier.toLowerCase()) {
                addr += `, ${ad.ville}`;
            }
            return addr;
        }

        // 3: Code postal
        if (ad.code_postal) {
            return `${ad.code_postal}${ad.ville ? ' ' + ad.ville : ''}`;
        }

        // 4: Enfin la ville
        if (ad.ville) {
            return ad.ville;
        }

        return null;
    }

    /**
     * Build a generic Google Maps link from a free-form address.
     */
    private buildMapsLinkFromAddress(address: string): string {
        const encodedAddress = encodeURIComponent(address);
        return `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
    }

    /**
     * Build a Google Maps link from coordinates.
     */
    private buildMapsLinkFromCoords(lat: number, lng: number): string {
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }

    /**
     * Format the alert message for a Facebook-origin ad.
     */
    async formatFacebookAlertMessage(ad: AdWithPost, score: ScoreResult): Promise<string> {
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

        // Location - Show EITHER complete address OR quartier/code_postal/ville
        const adresse = this.buildAddress(ad);
        if (adresse) {
            const mapsUrl = this.buildMapsLinkFromAddress(adresse);
            msg += `📍 [${adresse}](${mapsUrl})\n`;
        } else {
            msg += `📍 Localisation non communiquée\n`;
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
     * Format the alert message for a Agency (régie) ad.
     * Uses both the raw Agency row and the adapted scoring ad.
     */
    formatAgencyAlertMessage(raw: AgencyAd, scoringAd: Ad, score: ScoreResult): string {
        const isPremium = score.score_total >= 120;
        let msg = '';

        // Header
        const regieLabel = raw.regie || 'Régie immobilière';
        if (isPremium) {
            msg += `🌟 **MATCH PARFAIT – ${regieLabel}** 🌟\n\n`;
        } else {
            msg += `🏢 **Annonce régie – ${regieLabel}**\n\n`;
        }

        // Time: use created_at as proxy for publication date
        const timePosted = this.formatTimePosted(raw.created_at);
        msg += `🕒 Publiée ${timePosted}\n\n`;

        // Property details
        const title = this.formatValue(raw.title, 'Logement');
        const pieces = scoringAd.nombre_pieces
            ? `${scoringAd.nombre_pieces} pièce${scoringAd.nombre_pieces > 1 ? 's' : ''}`
            : 'Nombre de pièces non communiqué';
        const surface = scoringAd.surface_m2
            ? `${scoringAd.surface_m2}m²`
            : '';

        msg += `🏠 **${title}** - ${pieces}`;
        if (surface) {
            msg += ` - ${surface}`;
        }
        msg += '\n';

        // Location: prefer full address, then ville
        const adresse = raw.address || scoringAd.adresse_complete || scoringAd.ville || null;
        if (adresse) {
            let mapsUrl: string;
            if (raw.latitude && raw.longitude) {
                mapsUrl = this.buildMapsLinkFromCoords(raw.latitude, raw.longitude);
            } else {
                mapsUrl = this.buildMapsLinkFromAddress(adresse);
            }
            msg += `📍 [${adresse}](${mapsUrl})\n`;
        } else {
            msg += `📍 Localisation non communiquée\n`;
        }

        // Price (always monthly here)
        const prix = scoringAd.loyer_total
            ? `**${scoringAd.loyer_total} ${raw.currency || 'CHF'}/mois**`
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

        // Additional info
        const additionalInfo: string[] = [];
        if (raw.balcony || scoringAd.balcon) additionalInfo.push('🌿 Balcon');
        if (scoringAd.terrasse) additionalInfo.push('🌿 Terrasse');
        if (raw.car_park || scoringAd.parking_inclus) additionalInfo.push('🚗 Parking');
        if (scoringAd.meuble) additionalInfo.push('🛋️ Meublé');

        if (additionalInfo.length > 0) {
            msg += `${additionalInfo.join(' • ')}\n\n`;
        }

        // Availability
        const dispo = raw.available_date || scoringAd.date_disponibilite;
        if (dispo) {
            const disponibilite = new Date(dispo).toLocaleDateString('fr-FR');
            msg += `📅 Disponible à partir du ${disponibilite}\n`;
        }

        // No "urgence" flag for régies for now; can be added later if needed

        // Source link
        if (raw.source_url) {
            msg += `\n[👉 Voir l'annonce sur le site de la régie](${raw.source_url})`;
        }

        return msg;
    }

    /**
     * Check if image exists in bucket
     */
    async hasValidImage(imagePath: string | null): Promise<boolean> {
        if (!imagePath) return false;

        try {
            // Use Head Object or a limited search to check existence without listing everything
            const { data, error } = await supabase.storage
                .from('annonces_images')
                .createSignedUrl(imagePath, 60);

            return !error && !!data?.signedUrl;
        } catch (error) {
            console.error('Error checking image existence:', error);
            return false;
        }
    }
}
