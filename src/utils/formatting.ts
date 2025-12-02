import { ExtractedCriteria } from '../services/openai.service';

export function formatCriteriaSummary(criteria: ExtractedCriteria): string {
    const stricts = criteria.criteres_stricts;
    const confort = criteria.criteres_confort;

    let msg = `📋 **Récapitulatif de ta recherche**\n\n`;

    msg += `🔒 **Critères Stricts** (Deal-breakers)\n`;
    msg += `- Budget max: ${stricts.budget_max ? stricts.budget_max + ' CHF' : 'Non spécifié'}\n`;
    msg += `- Zones: ${stricts.zones.length > 0 ? stricts.zones.join(', ') : 'Toute la ville'}\n`;
    msg += `- Pièces: ${stricts.nombre_pieces_min || '?'}-${stricts.nombre_pieces_max || '?'} pièces\n`;
    msg += `- Type: ${stricts.type_logement.length > 0 ? stricts.type_logement.join(', ') : 'Tout'}\n`;
    if (stricts.disponibilite) msg += `- Dispo: ${stricts.disponibilite}\n`;

    msg += `\n✨ **Critères Confort** (Bonus)\n`;
    if (confort.dernier_etage) msg += `- Dernier étage ☀️\n`;
    if (confort.balcon) msg += `- Balcon/Terrasse 🌿\n`;
    if (confort.calme) msg += `- Calme 🤫\n`;
    if (confort.meuble) msg += `- Meublé 🛋️\n`;
    if (confort.parking) msg += `- Parking 🚗\n`;
    if (confort.ascenseur) msg += `- Ascenseur 🛗\n`;
    if (confort.autres.length > 0) msg += `- Autres: ${confort.autres.join(', ')}\n`;

    msg += `\n🤖 **Résumé**: ${criteria.resume_humain}\n`;

    if (criteria.criteres_manquants.length > 0) {
        const manquants = criteria.criteres_manquants.map(c => `\`${c}\``).join(', ');
        msg += `\n⚠️ **Il me manque ces infos importantes** : ${manquants}\n`;
    }

    return msg;
}
