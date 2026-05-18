import { Ad, UserCriteria } from '../../types/database';

// Defaults: a Plainpalais apartment at 2000 CHF, 3 rooms.
// Default ad × default criteria = full match (score 100 strict + comfort points).
export function makeAd(overrides: Partial<Ad> = {}): Ad {
    return {
        id: 1,
        facebook_post_id: '123',
        adresse_complete: 'Rue de Plainpalais 12',
        rue: 'Rue de Plainpalais',
        numero_rue: '12',
        ville: 'Genève',
        code_postal: '1205',
        quartier: 'Plainpalais',
        nombre_pieces: 3,
        type_logement: 'Appartement',
        surface_m2: 70,
        etage: 3,
        dernier_etage: false,
        nombre_chambres: 2,
        balcon: false,
        terrasse: false,
        meuble: false,
        loyer_mensuel: 1800,
        loyer_total: 2000,
        parking_inclus: false,
        date_disponibilite: '2024-01-01',
        urgence: false,
        image_path: null,
        created_at: new Date().toISOString(),
        ...overrides,
    };
}

// Defaults: match the default ad — zones Plainpalais, budget 2500, min 3 rooms, type Appartement.
export function makeCriteria(overrides: Partial<UserCriteria> = {}): UserCriteria {
    return {
        user_id: 123,
        criteres_stricts: {
            budget_max: 2500,
            zones: ['Plainpalais'],
            nombre_pieces_min: 3,
            nombre_pieces_max: null,
            type_logement: ['Appartement'],
            disponibilite: null,
        },
        criteres_confort: {
            dernier_etage: false,
            balcon: false,
            calme: false,
            meuble: false,
            parking: false,
            ascenseur: false,
            autres: [],
        },
        description_originale: '',
        resume_humain: '',
        confiance_extraction: 1,
        updated_at: '',
        ...overrides,
    };
}
