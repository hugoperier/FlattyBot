import { Context, SessionFlavor } from 'grammy';
import { ExtractedCriteria } from '../services/openai.service';

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
}

export interface SessionData {
    step: 'IDLE' | 'AWAITING_AUTHORIZATION' | 'ONBOARDING_WAITING_DESCRIPTION' | 'ONBOARDING_WAITING_CONFIRMATION';
    tempCriteria?: ExtractedCriteria;
    conversationHistory?: ConversationMessage[];
    existingCriteria?: ExtractedCriteria;
}

export type MyContext = Context & SessionFlavor<SessionData>;
