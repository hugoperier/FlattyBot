export interface User {
    telegram_id: number;
    is_active: boolean;
    is_paused: boolean;
    onboarding_completed: boolean;
    created_at: string;
    last_interaction: string;
}

export interface UserCriteria {
    user_id: number;
    criteres_stricts: any; // JSONB
    criteres_confort: any; // JSONB
    description_originale: string;
    resume_humain: string;
    confiance_extraction: number;
    updated_at: string;
}

export interface Ad {
    id: number;
    facebook_post_id: string;
    adresse_complete: string;
    ville: string;
    code_postal: string;
    quartier: string;
    nombre_pieces: number;
    type_logement: string;
    surface_m2: number;
    etage: number;
    dernier_etage: boolean;
    nombre_chambres: number;
    balcon: boolean;
    terrasse: boolean;
    meuble: boolean;
    loyer_mensuel: number;
    loyer_total: number;
    parking_inclus: boolean;
    date_disponibilite: string;
    urgence: boolean;
    created_at: string;
}

export interface SentAlert {
    id?: number;
    user_id: number;
    annonce_id: number;
    score_total: number;
    score_criteres_stricts: number;
    score_criteres_confort: number;
    criteres_stricts_matches: string[];
    criteres_confort_matches: string[];
    badges: string[];
    sent_at?: string;
    user_action?: string;
}
