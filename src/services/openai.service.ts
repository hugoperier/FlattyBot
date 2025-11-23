import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface ExtractedCriteria {
    criteres_stricts: {
        budget_max: number | null;
        zones: string[];
        nombre_pieces_min: number | null;
        nombre_pieces_max: number | null;
        type_logement: string[];
        disponibilite: string | null;
    };
    criteres_confort: {
        dernier_etage: boolean;
        calme: boolean;
        balcon: boolean;
        meuble: boolean;
        parking: boolean;
        ascenseur: boolean;
        autres: string[];
    };
    criteres_manquants: string[];
    confiance: number;
    resume_humain: string;
}

/**
 * Options for contextual criteria extraction.
 * Allows the AI to understand iterative modifications and maintain conversation context.
 */
export interface ExtractionOptions {
    /**
     * Recent conversation history to provide context for the current request.
     * Limited to the last 5 messages to avoid overloading the prompt.
     */
    conversationHistory?: Array<{ role: string; content: string }>;

    /**
     * Previously defined criteria, if any.
     * Allows the AI to understand modifications vs. new criteria definition.
     */
    existingCriteria?: ExtractedCriteria;
}

export class OpenAIService {
    /**
     * Extracts user criteria from a natural language description.
     * 
     * This method supports contextual extraction by accepting:
     * - Conversation history: to understand iterative refinements
     * - Existing criteria: to detect modifications vs. new criteria
     * 
     * @param userDescription - Natural language description from the user
     * @param options - Optional context for enhanced extraction
     * @returns Extracted criteria with confidence score and human summary
     * 
     * @example
     * // New user, no context
     * await extractCriteria("Je cherche un 3 pièces à Carouge, max 2500 CHF");
     * 
     * @example
     * // User modifying existing criteria
     * await extractCriteria("je veux monter à 2800 CHF", {
     *   existingCriteria: currentCriteria,
     *   conversationHistory: sessionHistory
     * });
     */
    async extractCriteria(
        userDescription: string,
        options?: ExtractionOptions
    ): Promise<ExtractedCriteria> {
        // Build context from existing criteria if available
        let existingContext = '';
        if (options?.existingCriteria) {
            existingContext = `
    
    ℹ️ L'utilisateur a déjà défini les critères suivants :
    - Budget max : ${options.existingCriteria.criteres_stricts.budget_max || 'non défini'} CHF
    - Zones : ${options.existingCriteria.criteres_stricts.zones.join(', ') || 'non définies'}
    - Pièces : ${options.existingCriteria.criteres_stricts.nombre_pieces_min || '?'} à ${options.existingCriteria.criteres_stricts.nombre_pieces_max || '?'}
    - Type logement : ${options.existingCriteria.criteres_stricts.type_logement.join(', ') || 'non défini'}
    - Résumé actuel : "${options.existingCriteria.resume_humain}"
    
    Sa nouvelle demande peut être :
    - Une modification de critères existants (ex: "en fait je veux monter à 2800 CHF")
    - Un ajout de critères (ex: "j'aimerais aussi un balcon")
    - Une reformulation complète
    
    Dans tous les cas, retourne les critères COMPLETS et FINAUX après modification.`;
        }

        // Build conversation history context
        let historyContext = '';
        if (options?.conversationHistory && options.conversationHistory.length > 0) {
            const recentHistory = options.conversationHistory.slice(-5); // Last 5 messages
            historyContext = `
    
    📝 Contexte de la conversation récente :
${recentHistory.map(msg => `    ${msg.role === 'user' ? 'Utilisateur' : 'Assistant'} : "${msg.content}"`).join('\n')}
    
    Utilise ce contexte pour mieux comprendre la demande actuelle.`;
        }

        const prompt = `
    Tu es un assistant immobilier expert pour Genève. Ta tâche est d'extraire les critères de recherche d'un utilisateur à partir de sa description en langage naturel.${existingContext}${historyContext}
    
    Règles d'extraction :
    1. **Critères stricts** (deal-breakers) : budget_max, zones (quartiers/villes), nombre_pieces (min/max), type_logement, disponibilite.
       - Si l'utilisateur dit "max", "obligatoire", "minimum" -> strict.
       - Zones genevoises reconnues : Centre-ville (1201), Carouge (1227), Plainpalais (1205), Eaux-Vives (1207/1208), Lancy (1212/1213), Champel, Servette, etc.
    2. **Critères de confort** (nice-to-have) : dernier_etage, calme, balcon, meuble, parking, ascenseur, etc.
       - Si l'utilisateur dit "si possible", "idéalement", "je privilégie" -> confort.
    3. **Critères manquants** : Liste les critères stricts critiques qui n'ont pas été mentionnés (ex: budget, zone, nombre de pièces).
    
    Retourne UNIQUEMENT un JSON valide avec la structure suivante :
    {
      "criteres_stricts": {
        "budget_max": number | null,
        "zones": string[],
        "nombre_pieces_min": number | null,
        "nombre_pieces_max": number | null,
        "type_logement": string[],
        "disponibilite": string | null
      },
      "criteres_confort": {
        "dernier_etage": boolean,
        "calme": boolean,
        "balcon": boolean,
        "meuble": boolean,
        "parking": boolean,
        "ascenseur": boolean,
        "autres": string[]
      },
      "criteres_manquants": string[],
      "confiance": number (0.0 à 1.0),
      "resume_humain": "Un court résumé de la recherche (ex: 'Recherche un 3 pièces à Carouge pour 2000 CHF max...')"
    }

    Description utilisateur : "${userDescription}"
    `;

        try {
            const completion = await openai.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "gpt-5-nano",
                response_format: { type: "json_object" }
            });

            const content = completion.choices[0].message.content;
            if (!content) throw new Error("Empty response from OpenAI");

            return JSON.parse(content) as ExtractedCriteria;
        } catch (error) {
            console.error("Error extracting criteria:", error);
            throw error;
        }
    }
}
