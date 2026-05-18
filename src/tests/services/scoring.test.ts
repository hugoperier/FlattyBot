import { describe, it, expect, beforeAll } from 'vitest';
import { ScoringService } from '../../services/scoring.service';
import { makeAd, makeCriteria } from '../_helpers/factories';

// ScoringService reads JSON data synchronously at construction time — safe for unit tests.
const scoring = new ScoringService();

// ─── A. Strict criteria – all-pass paths ─────────────────────────────────────

describe('strict criteria – pass paths', () => {
    it('all four criteria match → strict score 100', () => {
        const result = scoring.calculateScore(makeAd(), makeCriteria());
        expect(result.score_criteres_stricts).toBe(100);
        expect(result.score_total).toBeGreaterThan(0);
    });

    it('no zones specified → zone awarded by default (30 pts)', () => {
        const result = scoring.calculateScore(
            makeAd(),
            makeCriteria({ criteres_stricts: { budget_max: 2500, zones: [], nombre_pieces_min: 3, nombre_pieces_max: null, type_logement: ['Appartement'], disponibilite: null } })
        );
        expect(result.score_criteres_stricts).toBe(100);
    });

    it('no budget_max → budget awarded by default (30 pts)', () => {
        const result = scoring.calculateScore(
            makeAd(),
            makeCriteria({ criteres_stricts: { budget_max: null, zones: ['Plainpalais'], nombre_pieces_min: 3, nombre_pieces_max: null, type_logement: ['Appartement'], disponibilite: null } })
        );
        expect(result.score_criteres_stricts).toBe(100);
    });

    it('no piece range → pièces awarded by default (25 pts)', () => {
        const result = scoring.calculateScore(
            makeAd(),
            makeCriteria({ criteres_stricts: { budget_max: 2500, zones: ['Plainpalais'], nombre_pieces_min: null, nombre_pieces_max: null, type_logement: ['Appartement'], disponibilite: null } })
        );
        expect(result.score_criteres_stricts).toBe(100);
    });

    it('no type_logement → type awarded by default (15 pts)', () => {
        const result = scoring.calculateScore(
            makeAd(),
            makeCriteria({ criteres_stricts: { budget_max: 2500, zones: ['Plainpalais'], nombre_pieces_min: 3, nombre_pieces_max: null, type_logement: [], disponibilite: null } })
        );
        expect(result.score_criteres_stricts).toBe(100);
    });
});

// ─── B. Strict criteria – fail paths ──────────────────────────────────────────

describe('strict criteria – fail paths (each returns score_total 0)', () => {
    it('zone mismatch → score 0', () => {
        const result = scoring.calculateScore(
            makeAd({ quartier: 'Plainpalais', code_postal: '1205', ville: 'Genève' }),
            makeCriteria({ criteres_stricts: { budget_max: 2500, zones: ['Eaux-Vives'], nombre_pieces_min: 3, nombre_pieces_max: null, type_logement: ['Appartement'], disponibilite: null } })
        );
        expect(result.score_total).toBe(0);
        expect(result.rejectionReasons).toContain('Zone non correspondante');
    });

    it('budget exceeded → score 0', () => {
        const result = scoring.calculateScore(
            makeAd({ loyer_total: 3000 }),
            makeCriteria({ criteres_stricts: { budget_max: 2500, zones: ['Plainpalais'], nombre_pieces_min: 3, nombre_pieces_max: null, type_logement: ['Appartement'], disponibilite: null } })
        );
        expect(result.score_total).toBe(0);
        expect(result.rejectionReasons.some(r => r.includes('Budget'))).toBe(true);
    });

    it('budget edge: loyer_total === budget_max → passes', () => {
        const result = scoring.calculateScore(
            makeAd({ loyer_total: 2500 }),
            makeCriteria()
        );
        expect(result.score_total).toBeGreaterThan(0);
    });

    it('nombre_pieces below min → score 0', () => {
        const result = scoring.calculateScore(
            makeAd({ nombre_pieces: 2 }),
            makeCriteria({ criteres_stricts: { budget_max: 2500, zones: ['Plainpalais'], nombre_pieces_min: 3, nombre_pieces_max: null, type_logement: ['Appartement'], disponibilite: null } })
        );
        expect(result.score_total).toBe(0);
        expect(result.rejectionReasons.some(r => r.includes('pièces'))).toBe(true);
    });

    it('nombre_pieces above max → score 0', () => {
        const result = scoring.calculateScore(
            makeAd({ nombre_pieces: 5 }),
            makeCriteria({ criteres_stricts: { budget_max: 2500, zones: ['Plainpalais'], nombre_pieces_min: 3, nombre_pieces_max: 4, type_logement: ['Appartement'], disponibilite: null } })
        );
        expect(result.score_total).toBe(0);
    });

    it('type_logement mismatch → score 0', () => {
        const result = scoring.calculateScore(
            makeAd({ type_logement: 'Studio' }),
            makeCriteria({ criteres_stricts: { budget_max: 2500, zones: ['Plainpalais'], nombre_pieces_min: 3, nombre_pieces_max: null, type_logement: ['Appartement'], disponibilite: null } })
        );
        expect(result.score_total).toBe(0);
        expect(result.rejectionReasons.some(r => r.includes('Type'))).toBe(true);
    });
});

// ─── C. Benefit-of-doubt: missing ad data passes ──────────────────────────────

describe('benefit-of-doubt: null ad fields pass strict criteria', () => {
    it('both loyer_total and loyer_mensuel null → budget passes', () => {
        const result = scoring.calculateScore(
            makeAd({ loyer_total: null, loyer_mensuel: null }),
            makeCriteria()
        );
        expect(result.score_total).toBeGreaterThan(0);
    });

    it('nombre_pieces null → pièces passes', () => {
        const result = scoring.calculateScore(
            makeAd({ nombre_pieces: null }),
            makeCriteria()
        );
        expect(result.score_total).toBeGreaterThan(0);
    });

    it('type_logement null → type passes', () => {
        const result = scoring.calculateScore(
            makeAd({ type_logement: null }),
            makeCriteria()
        );
        expect(result.score_total).toBeGreaterThan(0);
    });
});

// ─── D. Budget specifics ──────────────────────────────────────────────────────

describe('budget specifics', () => {
    it('loyer_total used over loyer_mensuel: total within budget, mensuel exceeds → passes', () => {
        // loyer_total 2000 ≤ 2500, loyer_mensuel 3000 > 2500 — total wins
        const result = scoring.calculateScore(
            makeAd({ loyer_total: 2000, loyer_mensuel: 3000 }),
            makeCriteria()
        );
        expect(result.score_total).toBeGreaterThan(0);
    });

    it('"Prix exceptionnel" badge at ≤85% of budget_max', () => {
        // 85% of 2500 = 2125 exactly
        const result = scoring.calculateScore(
            makeAd({ loyer_total: 2125 }),
            makeCriteria()
        );
        expect(result.badges).toContain('💎 Prix exceptionnel');
    });

    it('"Prix exceptionnel" badge absent at 86% of budget_max', () => {
        // 86% of 2500 = 2150
        const result = scoring.calculateScore(
            makeAd({ loyer_total: 2150 }),
            makeCriteria()
        );
        expect(result.badges).not.toContain('💎 Prix exceptionnel');
    });
});

// ─── E. Zone resolution ───────────────────────────────────────────────────────

describe('zone resolution', () => {
    it('exclusive Geneva mapping: "centre-ville" expands to Plainpalais and others', () => {
        // "centre-ville" is only in the exclusive Geneva map → expands to ['Cité-Centre', 'Saint-Gervais', 'Plainpalais']
        const result = scoring.calculateScore(
            makeAd({ quartier: 'Plainpalais', ville: 'Genève' }),
            makeCriteria({ criteres_stricts: { budget_max: 2500, zones: ['centre-ville'], nombre_pieces_min: 3, nombre_pieces_max: null, type_logement: ['Appartement'], disponibilite: null } })
        );
        expect(result.score_total).toBeGreaterThan(0);
    });

    it('fallback address scan: no quartier/postal/ville, adresse_complete contains zone name', () => {
        const result = scoring.calculateScore(
            makeAd({ quartier: null, code_postal: null, ville: null, adresse_complete: 'Rue de Carouge 12, Carouge' }),
            makeCriteria({ criteres_stricts: { budget_max: 2500, zones: ['Carouge'], nombre_pieces_min: 3, nombre_pieces_max: null, type_logement: ['Appartement'], disponibilite: null } })
        );
        expect(result.score_total).toBeGreaterThan(0);
    });

    it('postal code resolution: 1205 → Plainpalais', () => {
        const result = scoring.calculateScore(
            makeAd({ quartier: null, code_postal: '1205', ville: 'Genève' }),
            makeCriteria({ criteres_stricts: { budget_max: 2500, zones: ['Plainpalais'], nombre_pieces_min: 3, nombre_pieces_max: null, type_logement: ['Appartement'], disponibilite: null } })
        );
        expect(result.score_total).toBeGreaterThan(0);
    });

    it('multi-zone OR: ad in Carouge matches criteria with [Carouge, Eaux-Vives]', () => {
        const result = scoring.calculateScore(
            makeAd({ quartier: 'Carouge', code_postal: '1227', ville: 'Carouge' }),
            makeCriteria({ criteres_stricts: { budget_max: 2500, zones: ['Carouge', 'Eaux-Vives'], nombre_pieces_min: 3, nombre_pieces_max: null, type_logement: ['Appartement'], disponibilite: null } })
        );
        expect(result.score_total).toBeGreaterThan(0);
    });
});

// ─── F. Comfort criteria ──────────────────────────────────────────────────────

describe('comfort criteria', () => {
    it.each([
        ['dernier_etage', { dernier_etage: true }, { dernier_etage: true }, 5],
        ['balcon', { balcon: true }, { balcon: true }, 4],
        ['meuble', { meuble: true }, { meuble: true }, 4],
        ['parking', { parking_inclus: true }, { parking: true }, 4],
    ] as const)('%s awards its declared points', (_name, adExtra, confortExtra, expectedPts) => {
        const criteria = makeCriteria();
        criteria.criteres_confort = { ...criteria.criteres_confort, ...confortExtra };
        const result = scoring.calculateScore(makeAd(adExtra as Partial<Parameters<typeof makeAd>[0]>), criteria);
        expect(result.score_criteres_confort).toBe(expectedPts);
    });

    it('terrasse alone satisfies balcon criterion', () => {
        const criteria = makeCriteria();
        criteria.criteres_confort = { ...criteria.criteres_confort, balcon: true };
        const result = scoring.calculateScore(makeAd({ balcon: false, terrasse: true }), criteria);
        expect(result.score_criteres_confort).toBe(4);
    });

    it('unmatched comfort criteria award 0 bonus points', () => {
        const criteria = makeCriteria();
        criteria.criteres_confort = { ...criteria.criteres_confort, balcon: true, parking: true };
        const result = scoring.calculateScore(makeAd({ balcon: false, parking_inclus: false }), criteria);
        expect(result.score_criteres_confort).toBe(0);
    });
});

// ─── G. Badges ────────────────────────────────────────────────────────────────

describe('badges', () => {
    it('urgence flag adds 🚨 URGENT badge', () => {
        const result = scoring.calculateScore(makeAd({ urgence: true }), makeCriteria());
        expect(result.badges).toContain('🚨 URGENT');
    });

    it('all comfort criteria matched → max total score is 117 (100 strict + 17 comfort)', () => {
        // dernier_etage 5 + balcon 4 + meuble 4 + parking 4 = 17 comfort pts max
        // ⭐⭐⭐ Match parfait threshold is > 120, which is currently unreachable (117 ≤ 120)
        const criteria = makeCriteria();
        criteria.criteres_confort = { dernier_etage: true, balcon: true, meuble: true, parking: true, calme: false, ascenseur: false, autres: [] };
        const ad = makeAd({ dernier_etage: true, balcon: true, meuble: true, parking_inclus: true });
        const result = scoring.calculateScore(ad, criteria);
        expect(result.score_total).toBe(117);
        expect(result.badges).not.toContain('⭐⭐⭐ Match parfait');
    });
});
