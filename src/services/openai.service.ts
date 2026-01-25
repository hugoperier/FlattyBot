import OpenAI from 'openai';
import dotenv from 'dotenv';
import { CRITERIA_SCHEMA, SYSTEM_PROMPT, formatUserPrompt } from './openai.prompts';

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

        const userContent = formatUserPrompt(userDescription, options);

        try {
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: userContent }
                ],
                model: "gpt-5-nano",
                // @ts-ignore
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "extraction_criteres",
                        strict: false,
                        schema: CRITERIA_SCHEMA
                    }
                },
                // @ts-ignore
                reasoning_effort: "medium",
                // @ts-ignore
                verbosity: "medium"
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
