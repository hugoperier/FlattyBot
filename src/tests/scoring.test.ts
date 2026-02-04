import { ScoringService } from '../services/scoring.service';
import { Ad, UserCriteria } from '../types/database';

const scoringService = new ScoringService();

const mockAd: Ad = {
    id: 1,
    facebook_post_id: '123',
    adresse_complete: 'Rue de Carouge 12',
    ville: 'Genève',
    code_postal: '1205',
    quartier: 'Plainpalais',
    nombre_pieces: 3,
    type_logement: 'Appartement',
    surface_m2: 70,
    etage: 5,
    dernier_etage: true,
    nombre_chambres: 2,
    balcon: true,
    terrasse: false,
    meuble: false,
    loyer_mensuel: 2000,
    loyer_total: 2200,
    parking_inclus: false,
    date_disponibilite: '2023-12-01',
    urgence: false,
    image_path: null,
    created_at: new Date().toISOString(),
    rue: 'Rue de Carouge',
    numero_rue: '12'
};

const mockCriteria: UserCriteria = {
    user_id: 123,
    criteres_stricts: {
        budget_max: 2500,
        zones: ['Carouge', 'Plainpalais'],
        nombre_pieces_min: 3,
        nombre_pieces_max: null,
        type_logement: ['Appartement'],
        disponibilite: null
    },
    criteres_confort: {
        dernier_etage: true,
        balcon: true,
        calme: false,
        meuble: false,
        parking: false,
        ascenseur: true,
        autres: []
    },
    description_originale: '',
    resume_humain: '',
    confiance_extraction: 1,
    updated_at: ''
};

export function testScoring() {
    console.log('Running Scoring Tests...');

    const result = scoringService.calculateScore(mockAd, mockCriteria);

    // Expected:
    // Strict:
    // - Zone: Match (Plainpalais) -> 30
    // - Budget: Match (2200 <= 2500) -> 30
    // - Pièces: Match (3 >= 3) -> 25
    // - Type: Match -> 15
    // Total Strict = 100

    // Comfort:
    // - Dernier étage: Match -> 5
    // - Balcon: Match -> 4
    // - Ascenseur: Not in ad data (undefined), assuming false or we need to add it to mockAd if we want to test it.
    // Let's assume ad doesn't specify ascenseur, so 0.
    // Total Comfort = 9

    // Total = 109

    console.assert(result.score_criteres_stricts === 100, `Expected strict score 100, got ${result.score_criteres_stricts}`);
    console.assert(result.score_criteres_confort === 9, `Expected comfort score 9, got ${result.score_criteres_confort}`);
    console.assert(result.score_total === 109, `Expected total score 109, got ${result.score_total}`);

    if (result.score_total === 109) {
        console.log('✅ Scoring Test Passed');
    } else {
        console.error('❌ Scoring Test Failed');
    }
}
