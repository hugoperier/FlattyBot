
import { ExtractionOptions, ExtractedCriteria } from './openai.service';

export const CRITERIA_SCHEMA = {
    type: "object",
    properties: {
        criteres_stricts: {
            type: "object",
            properties: {
                budget_max: { type: ["number", "null"] },
                zones: { type: "array", items: { type: "string" } },
                nombre_pieces_min: { type: ["number", "null"] },
                nombre_pieces_max: { type: ["number", "null"] },
                type_logement: { type: "array", items: { type: "string" } },
                disponibilite: { type: ["string", "null"] }
            },
            required: ["budget_max", "zones", "nombre_pieces_min", "nombre_pieces_max", "type_logement", "disponibilite"],
            additionalProperties: false
        },
        criteres_confort: {
            type: "object",
            properties: {
                dernier_etage: { type: "boolean" },
                calme: { type: "boolean" },
                balcon: { type: "boolean" },
                meuble: { type: "boolean" },
                parking: { type: "boolean" },
                ascenseur: { type: "boolean" },
                autres: { type: "array", items: { type: "string" } }
            },
            required: ["dernier_etage", "calme", "balcon", "meuble", "parking", "ascenseur", "autres"],
            additionalProperties: false
        },
        criteres_manquants: {
            type: "array",
            items: { type: "string" },
            description: "At most 2 of the most critical missing strict criteria (budget, zones, nombre_pieces in priority order). Empty if all are known."
        },
        question_followup: {
            type: ["string", "null"],
            description: "A short, friendly question in the conversation language asking for the 1-2 missing criteria. Null if nothing is missing."
        },
        confiance: {
            type: "number",
            description: "Confidence score between 0.0 and 1.0"
        },
        resume_humain: {
            type: "string",
            description: "A short summary of the search (e.g. 'Recherche un 3 pièces à Carouge pour 2000 CHF max...')"
        }
    },
    required: ["criteres_stricts", "criteres_confort", "criteres_manquants", "question_followup", "confiance", "resume_humain"],
    additionalProperties: false
};

export const SYSTEM_PROMPT = `
Tu es un assistant immobilier expert pour Genève. Ta tâche est d'extraire les critères de recherche d'un utilisateur à partir de sa description en langage naturel.

Règles d'extraction :
1. **Critères stricts** (deal-breakers) : budget_max, zones (quartiers/villes), nombre_pieces (min/max), type_logement, disponibilite.
   - type_logement doit idéalement contenir "appartement" ou "colocation" si deduction possible selon la phrase de recherche.
   - Si l'utilisateur dit "max", "obligatoire", "minimum" -> strict.
   - Zones genevoises reconnues : Carouge, Plainpalais, Eaux-Vives, Lancy, Champel, Servette, etc.
2. **Critères de confort** (nice-to-have) : dernier_etage, calme, balcon, meuble, parking, ascenseur, etc.
   - Si l'utilisateur dit "si possible", "idéalement", "je privilégie" -> confort.
3. **Critères manquants** : Liste AU MAXIMUM les 2 critères stricts les plus importants qui n'ont pas été mentionnés.
   Ordre de priorité : budget_max > zones > nombre_pieces_min > type_logement > disponibilite.
   Si tous les critères importants sont connus, laisse le tableau vide.
4. **question_followup** : Si criteres_manquants est non vide, formule une question courte et naturelle (dans la langue de l'utilisateur) pour demander ces 1-2 informations manquantes. Sinon, retourne null.
`;

export const SYSTEM_PROMPT_EN = `
You are an expert real-estate assistant for Geneva. Your task is to extract the user's search criteria from a natural-language description.

Extraction rules:
1. **Strict criteria** (deal-breakers): budget_max, zones (districts/towns), nombre_pieces (min/max), type_logement, disponibilite.
   - Infer type_logement as "appartement" or "colocation" where possible.
   - If the user says "max", "required", "minimum" → strict.
   - Known Geneva zones: Carouge, Plainpalais, Eaux-Vives, Lancy, Champel, Servette, etc.
2. **Comfort criteria** (nice-to-have): dernier_etage, calme, balcon, meuble, parking, ascenseur, etc.
   - "if possible", "ideally", "I'd prefer" → comfort.
3. **Missing criteria**: List AT MOST the 2 most critical strict criteria that were not mentioned.
   Priority: budget_max > zones > nombre_pieces_min > type_logement > disponibilite.
   Leave the array empty if all important criteria are known.
4. **question_followup**: If criteres_manquants is non-empty, write a short, friendly question in English asking for the 1-2 missing items. Return null otherwise.
`;

export function formatUserPrompt(
    userDescription: string,
    options?: ExtractionOptions
): string {
    let promptParts = [];

    // 1. User Description (The Core Request)
    promptParts.push(`# 🗣️ DESCRIPTION UTILISATEUR\n"${userDescription}"`);

    // 2. Existing Criteria (Context)
    if (options?.existingCriteria) {
        const criteria = options.existingCriteria;
        const context = `
# 💾 CRITÈRES EXISTANTS
L'utilisateur a déjà défini ceci (il peut vouloir modifier ou ajouter) :
- Budget max : ${criteria.criteres_stricts.budget_max || 'non défini'} CHF
- Zones : ${criteria.criteres_stricts.zones.join(', ') || 'non définies'}
- Pièces : ${criteria.criteres_stricts.nombre_pieces_min || '?'} à ${criteria.criteres_stricts.nombre_pieces_max || '?'}
- Type : ${criteria.criteres_stricts.type_logement.join(', ') || 'non défini'}
- Résumé : "${criteria.resume_humain}"

⚠️ INSTRUCTION : Modifie ces critères SEULEMENT si la description utilisateur ci-dessus l'indique. Sinon, consérve-les.`;
        promptParts.push(context);
    }

    // 3. Conversation History (Context)
    if (options?.conversationHistory && options.conversationHistory.length > 0) {
        const recentHistory = options.conversationHistory.slice(-5);
        const historyText = recentHistory
            .map(msg => `- ${msg.role === 'user' ? 'USER' : 'ASSISTANT'} : "${msg.content}"`)
            .join('\n');

        promptParts.push(`# 📜 HISTORIQUE RÉCENT\n${historyText}`);
    }

    // 4. Instructions Summary
    promptParts.push(`\n# 🎯 TÂCHE\nAnalyse la description utilisateur en tenant compte du contexte et de l'historique pour produire ou mettre à jour les critères de recherche.`);

    return promptParts.join('\n\n');
}
