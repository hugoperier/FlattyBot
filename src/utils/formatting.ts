import { ExtractedCriteria } from '../services/openai.service';
import { Lang } from '../i18n/strings';

export function formatRooms(min: number | null, max: number | null, isEn: boolean): string | null {
    if (!min && !max) return null;
    const r = isEn ? 'rooms' : 'pièces';
    if (min && max && min === max) return `${min} ${r}`;
    if (min && max) return isEn ? `${min}–${max} ${r}` : `${min} à ${max} ${r}`;
    if (min) return `${min}+ ${r}`;
    if (max) return isEn ? `up to ${max} ${r}` : `jusqu'à ${max} ${r}`;
    return null;
}

export function formatCriteriaSummary(criteria: ExtractedCriteria, lang: Lang = 'fr'): string {
    const stricts = criteria.criteres_stricts || {};
    const confort = criteria.criteres_confort || {};

    const isEn = lang === 'en';

    const header = isEn ? '📋 **Search summary**' : '📋 **Récapitulatif de ta recherche**';
    const strictLabel = isEn ? '🔒 **Strict criteria** (deal-breakers)' : '🔒 **Critères Stricts** (Deal-breakers)';
    const comfortLabel = isEn ? '✨ **Comfort criteria** (bonus)' : '✨ **Critères Confort** (Bonus)';
    const summaryLabel = isEn ? '🤖 **Summary**' : '🤖 **Résumé**';
    const missingLabel = isEn ? '⚠️ **Still missing**' : '⚠️ **Il me manque ces infos importantes**';
    const na = isEn ? 'Not specified' : 'Non spécifié';
    const allCity = isEn ? 'Whole city' : 'Toute la ville';
    const all = isEn ? 'All' : 'Tout';
    const avail = isEn ? 'Availability' : 'Dispo';
    const notAvail = isEn ? 'Not available' : 'Non disponible';

    let msg = `${header}\n\n`;

    msg += `${strictLabel}\n`;
    msg += `- Budget max: ${stricts.budget_max ? stricts.budget_max + ' CHF' : na}\n`;
    msg += `- ${isEn ? 'Zones' : 'Zones'}: ${stricts.zones?.length > 0 ? stricts.zones.join(', ') : allCity}\n`;

    const roomsStr = formatRooms(stricts.nombre_pieces_min ?? null, stricts.nombre_pieces_max ?? null, isEn);
    if (roomsStr) msg += `- ${isEn ? 'Rooms' : 'Pièces'}: ${roomsStr}\n`;

    const types = stricts.type_logement || [];
    const hasColoc = types.some((t: string) => t.includes('coloc') || t.includes('chambre'));
    const hasAppart = types.some((t: string) => ['appart', 'studio', 'maison', 'duplex', 'loft'].some(k => t.includes(k)));
    const typeNote = (hasAppart && !hasColoc)
        ? (isEn ? ' _(flatshares excluded)_' : ' _(coloc/chambre exclus)_')
        : '';
    const typeStr = types.length > 0 ? types.join(', ') : all;
    msg += `- ${isEn ? 'Type' : 'Type'}: ${typeStr}${typeNote}\n`;

    if (stricts.disponibilite) msg += `- ${avail}: ${stricts.disponibilite}\n`;

    const comfortLines: string[] = [];
    if (confort.dernier_etage) comfortLines.push(isEn ? '- Top floor ☀️' : '- Dernier étage ☀️');
    if (confort.balcon) comfortLines.push(isEn ? '- Balcony/Terrace 🌿' : '- Balcon/Terrasse 🌿');
    if (confort.calme) comfortLines.push(isEn ? '- Quiet 🤫' : '- Calme 🤫');
    if (confort.meuble) comfortLines.push(isEn ? '- Furnished 🛋️' : '- Meublé 🛋️');
    if (confort.parking) comfortLines.push('- Parking 🚗');
    if (confort.ascenseur) comfortLines.push(isEn ? '- Elevator 🛗' : '- Ascenseur 🛗');
    if (confort.autres && Array.isArray(confort.autres) && confort.autres.length > 0) {
        comfortLines.push(`- ${isEn ? 'Other' : 'Autres'}: ${confort.autres.join(', ')}`);
    }
    if (comfortLines.length > 0) {
        msg += `\n${comfortLabel}\n${comfortLines.join('\n')}\n`;
    }

    msg += `\n${summaryLabel}: ${criteria.resume_humain || notAvail}\n`;

    if (criteria.criteres_manquants && Array.isArray(criteria.criteres_manquants) && criteria.criteres_manquants.length > 0) {
        const manquants = criteria.criteres_manquants.map(c => `\`${c}\``).join(', ');
        msg += `\n${missingLabel} : ${manquants}\n`;
    }

    return msg;
}
