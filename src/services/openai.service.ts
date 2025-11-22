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

export class OpenAIService {
    async extractCriteria(userDescription: string): Promise<ExtractedCriteria> {
        const prompt = `
    Tu es un assistant immobilier expert pour Genève. Ta tâche est d'extraire les critères de recherche d'un utilisateur à partir de sa description en langage naturel.
    
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
