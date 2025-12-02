export interface User {
    telegram_id: number;
    is_active: boolean;
    is_paused: boolean;
    onboarding_completed: boolean;
    pending_authorization?: boolean;
    authorized_at?: string;
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
    adresse_complete: string | null;
    ville: string | null;
    code_postal: string | null;
    quartier: string | null;
    nombre_pieces: number | null;
    type_logement: string | null;
    surface_m2: number | null;
    etage: number | null;
    dernier_etage: boolean | null;
    nombre_chambres: number | null;
    balcon: boolean | null;
    terrasse: boolean | null;
    meuble: boolean | null;
    loyer_mensuel: number | null;
    loyer_total: number | null;
    parking_inclus: boolean | null;
    date_disponibilite: string | null;
    urgence: boolean | null;
    image_path: string | null;
    created_at: string;
}

export interface FacebookPost {
    id: string;
    post_id: string;
    input_data: {
        permalink?: {
            raw: string;
            mobile: string;
            canonical: string;
        };
        [key: string]: any; // Other JSONB fields
    };
    time_posted: string;
    categorie: string;
    confiance: number;
    raison_classification: string;
    est_offre_location: boolean;
    processed_at: string | null;
    created_at: string | null;
    group_name: string;
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

export interface AdWithPost extends Ad {
    facebook_posts: FacebookPost;
}
