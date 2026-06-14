import { Context, SessionFlavor } from 'grammy';
import { ExtractedCriteria } from '../services/openai.service';
import { Lang } from '../i18n/strings';

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

export interface SessionData {
    step:
        | 'IDLE'
        | 'AWAITING_AUTHORIZATION'
        | 'ONBOARDING_LANGUAGE'
        | 'ONBOARDING_WAITING_DESCRIPTION'
        | 'ONBOARDING_ASKING_MISSING'
        | 'ONBOARDING_FALLBACK'
        | 'ONBOARDING_WAITING_TYPE_LOGEMENT'
        | 'ONBOARDING_WAITING_CONFIRMATION'
        | 'ONBOARDING_WAITING_MODIFICATION'
        | 'ONBOARDING_WAITING_LOCATION_VALIDATION'
        | 'ONBOARDING_WAITING_LOCATION_CLARIFICATION'
        | 'ONBOARDING_WAITING_MARKET_DECISION';
    language?: Lang;
    extractionRounds?: number;
    originalDescription?: string;
    tempCriteria?: ExtractedCriteria;
    conversationHistory?: ConversationMessage[];
    existingCriteria?: ExtractedCriteria;
    verifiedZones?: string[];
    suggestedZones?: string[];
    skipBudgetAsk?: boolean;
    skipPiecesAsk?: boolean;
    skipAvailAsk?: boolean;
}

export type MyContext = Context & SessionFlavor<SessionData>;
