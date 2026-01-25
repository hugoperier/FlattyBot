import { Ad, UserCriteria } from '../types/database';
import { ExtractedCriteria } from './openai.service';
import { LocationRepository } from '../repositories/LocationRepository';

export interface CriteriaCheck {
    name: string;           // Ex: "Zone", "Budget", "Pièces", "Type"
    passed: boolean;        // true if validated, false otherwise
    isStrict: boolean;      // true if strict criteria
    points: number;         // Points awarded
    maxPoints: number;      // Maximum points possible
    details: string;        // Explanatory message (Ex: "CHF 2000 ≤ CHF 2500")
}

export interface ScoreResult {
    score_total: number;
    score_criteres_stricts: number;
    score_criteres_confort: number;
    criteres_stricts_matches: string[];
    criteres_confort_matches: string[];
    badges: string[];
    checks: CriteriaCheck[];        // Details of all verified criteria
    rejectionReasons: string[];     // List of rejection reasons
}

export class ScoringService {
    private locationRepository: LocationRepository;

    constructor() {
        this.locationRepository = new LocationRepository();
    }

    private createCheck(name: string, passed: boolean, isStrict: boolean, points: number, maxPoints: number, details: string): CriteriaCheck {
        return { name, passed, isStrict, points, maxPoints, details };
    }


    calculateScore(ad: Ad, criteria: UserCriteria): ScoreResult {
        const stricts = criteria.criteres_stricts as ExtractedCriteria['criteres_stricts'];
        const confort = criteria.criteres_confort as ExtractedCriteria['criteres_confort'];

        let scoreStricts = 0;
        let scoreConfort = 0;
        const strictMatches: string[] = [];
        const confortMatches: string[] = [];
        const badges: string[] = [];
        const checks: CriteriaCheck[] = [];
        const rejectionReasons: string[] = [];

        // --- Strict Criteria ---
        let strictFail = false;

        // 1. Zone (30 pts)
        if (stricts.zones && stricts.zones.length > 0) {
            // Resolve Ad location to canonicals
            const resolvedLocations = this.locationRepository.resolveAdLocation(ad);
            const adRawLocation = `${ad.ville || ''} ${ad.quartier || ''} ${ad.code_postal || ''}`.trim();

            // Check intersection with user zones
            // We assume user zones are already canonical (validated during onboarding)
            const zoneMatch = stricts.zones.some(userZone =>
                resolvedLocations.includes(userZone)
            );

            if (zoneMatch) {
                scoreStricts += 30;
                strictMatches.push('Zone');
                checks.push(this.createCheck('Zone', true, true, 30, 30, `Recherché [${stricts.zones.join(', ')}] - Trouvé dans [${resolvedLocations.join(', ')}]`));
            } else {
                strictFail = true;
                checks.push(this.createCheck('Zone', false, true, 0, 30, `Recherché [${stricts.zones.join(', ')}] - Non trouvé (Résolu: [${resolvedLocations.join(', ')}], Brut: "${adRawLocation}")`));
                rejectionReasons.push('Zone non correspondante');
            }
        } else {
            // If no zone specified, we assume it matches
            scoreStricts += 30;
            checks.push(this.createCheck('Zone', true, true, 30, 30, 'Aucune zone spécifiée (accordé par défaut)'));
        }

        // 2. Budget (30 pts)
        if (stricts.budget_max) {
            if (ad.loyer_total && ad.loyer_total <= stricts.budget_max) {
                scoreStricts += 30;
                strictMatches.push('Budget');
                checks.push(this.createCheck('Budget', true, true, 30, 30, `CHF ${ad.loyer_total} ≤ CHF ${stricts.budget_max}`));

                // Badge: Prix exceptionnel
                if (ad.loyer_total <= stricts.budget_max * 0.85) {
                    badges.push('💎 Prix exceptionnel');
                }
            } else if (!ad.loyer_total) {
                // If price is not available, don't fail but don't award points
                scoreStricts += 30; // Give benefit of doubt
                checks.push(this.createCheck('Budget', true, true, 30, 30, 'Prix non disponible (accordé par défaut)'));
            } else {
                strictFail = true;
                checks.push(this.createCheck('Budget', false, true, 0, 30, `CHF ${ad.loyer_total} > CHF ${stricts.budget_max}`));
                rejectionReasons.push(`Budget dépassé (CHF ${ad.loyer_total} > CHF ${stricts.budget_max})`);
            }
        } else {
            scoreStricts += 30;
            checks.push(this.createCheck('Budget', true, true, 30, 30, 'Aucun budget spécifié (accordé par défaut)'));
        }

        // 3. Nombre de pièces (25 pts)
        if (stricts.nombre_pieces_min || stricts.nombre_pieces_max) {
            if (ad.nombre_pieces !== null) {
                let match = true;
                let reason = '';
                if (stricts.nombre_pieces_min && ad.nombre_pieces < stricts.nombre_pieces_min) {
                    match = false;
                    reason = `trop peu (${ad.nombre_pieces} < ${stricts.nombre_pieces_min})`;
                }
                if (stricts.nombre_pieces_max && ad.nombre_pieces > stricts.nombre_pieces_max) {
                    match = false;
                    reason = `trop (${ad.nombre_pieces} > ${stricts.nombre_pieces_max})`;
                }

                if (match) {
                    scoreStricts += 25;
                    strictMatches.push('Pièces');
                    checks.push(this.createCheck('Pièces', true, true, 25, 25, `${ad.nombre_pieces} dans la plage [${stricts.nombre_pieces_min || '?'}-${stricts.nombre_pieces_max || '?'}]`));
                } else {
                    strictFail = true;
                    checks.push(this.createCheck('Pièces', false, true, 0, 25, reason));
                    rejectionReasons.push(`Nombre de pièces ${reason}`);
                }
            } else {
                // If number of pieces is not available, give benefit of doubt
                scoreStricts += 25;
                checks.push(this.createCheck('Pièces', true, true, 25, 25, 'Non disponible (accordé par défaut)'));
            }
        } else {
            scoreStricts += 25;
            checks.push(this.createCheck('Pièces', true, true, 25, 25, 'Aucune contrainte spécifiée (accordé par défaut)'));
        }

        // 4. Type logement (15 pts)
        if (stricts.type_logement && stricts.type_logement.length > 0) {
            if (ad.type_logement) {
                const typeMatch = stricts.type_logement.some(t => ad.type_logement!.toLowerCase().includes(t.toLowerCase()));
                if (typeMatch) {
                    scoreStricts += 15;
                    strictMatches.push('Type');
                    checks.push(this.createCheck('Type', true, true, 15, 15, `"${ad.type_logement}" correspond à [${stricts.type_logement.join(', ')}]`));
                } else {
                    // TMP: Don't fail if type doesn't match
                    // strictFail = true;
                    checks.push(this.createCheck('Type', false, true, 0, 15, `"${ad.type_logement}" ne correspond pas à [${stricts.type_logement.join(', ')}]`));
                    // rejectionReasons.push('Type de logement non correspondant');
                }
            } else {
                // If type is not available, give benefit of doubt
                scoreStricts += 15;
                checks.push(this.createCheck('Type', true, true, 15, 15, 'Non disponible (accordé par défaut)'));
            }
        } else {
            scoreStricts += 15;
            checks.push(this.createCheck('Type', true, true, 15, 15, 'Aucun type spécifié (accordé par défaut)'));
        }

        // If any strict criteria failed, score is 0
        if (strictFail) {
            return {
                score_total: 0,
                score_criteres_stricts: 0,
                score_criteres_confort: 0,
                criteres_stricts_matches: [],
                criteres_confort_matches: [],
                badges: [],
                checks,
                rejectionReasons
            };
        }

        // --- Comfort Criteria (Max 30 pts) ---

        if (confort.dernier_etage && ad.dernier_etage) {
            scoreConfort += 5;
            confortMatches.push('Dernier étage');
            checks.push(this.createCheck('Dernier étage', true, false, 5, 5, 'Dernier étage disponible'));
        } else if (confort.dernier_etage) {
            checks.push(this.createCheck('Dernier étage', false, false, 0, 5, 'Pas au dernier étage'));
        }

        if (confort.balcon && (ad.balcon || ad.terrasse)) {
            scoreConfort += 4;
            confortMatches.push('Balcon/Terrasse');
            checks.push(this.createCheck('Balcon/Terrasse', true, false, 4, 4, 'Balcon ou terrasse disponible'));
        } else if (confort.balcon) {
            checks.push(this.createCheck('Balcon/Terrasse', false, false, 0, 4, 'Pas de balcon/terrasse'));
        }

        if (confort.meuble && ad.meuble) {
            scoreConfort += 4;
            confortMatches.push('Meublé');
            checks.push(this.createCheck('Meublé', true, false, 4, 4, 'Logement meublé'));
        } else if (confort.meuble) {
            checks.push(this.createCheck('Meublé', false, false, 0, 4, 'Non meublé'));
        }

        if (confort.parking && ad.parking_inclus) {
            scoreConfort += 4;
            confortMatches.push('Parking');
            checks.push(this.createCheck('Parking', true, false, 4, 4, 'Parking inclus'));
        } else if (confort.parking) {
            checks.push(this.createCheck('Parking', false, false, 0, 4, 'Pas de parking inclus'));
        }
        // ... add other comfort criteria logic here

        // Cap comfort score
        scoreConfort = Math.min(scoreConfort, 30);

        const totalScore = scoreStricts + scoreConfort;

        // Badges
        if (ad.urgence) badges.push('🚨 URGENT');
        if (totalScore > 120) badges.push('⭐⭐⭐ Match parfait');

        return {
            score_total: totalScore,
            score_criteres_stricts: scoreStricts,
            score_criteres_confort: scoreConfort,
            criteres_stricts_matches: strictMatches,
            criteres_confort_matches: confortMatches,
            badges,
            checks,
            rejectionReasons
        };
    }

}
