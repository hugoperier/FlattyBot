import OpenAI from 'openai';
import { CRITERIA_SCHEMA, SYSTEM_PROMPT, SYSTEM_PROMPT_EN, formatUserPrompt } from './openai.prompts';
import { Lang } from '../i18n/strings';

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
    question_followup: string | null;
    confiance: number;
    resume_humain: string;
}

export interface ExtractionOptions {
    conversationHistory?: Array<{ role: string; content: string }>;
    existingCriteria?: ExtractedCriteria;
    lang?: Lang;
}

export class OpenAIService {
    async extractCriteria(
        userDescription: string,
        options?: ExtractionOptions
    ): Promise<ExtractedCriteria> {

        const userContent = formatUserPrompt(userDescription, options);
        const systemPrompt = options?.lang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT;

        try {
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userContent }
                ],
                model: "gpt-5.4-nano",
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "extraction_criteres",
                        strict: false,
                        schema: CRITERIA_SCHEMA
                    }
                },
                reasoning_effort: "medium",
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
