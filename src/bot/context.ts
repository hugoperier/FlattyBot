import { Context, SessionFlavor } from 'grammy';
import { ExtractedCriteria } from '../services/openai.service';

export interface SessionData {
    step: 'IDLE' | 'ONBOARDING_WAITING_DESCRIPTION' | 'ONBOARDING_WAITING_CONFIRMATION';
    tempCriteria?: ExtractedCriteria;
}

export type MyContext = Context & SessionFlavor<SessionData>;
