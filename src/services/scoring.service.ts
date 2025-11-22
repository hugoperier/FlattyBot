import { Ad, UserCriteria } from '../types/database';
import { ExtractedCriteria } from './openai.service';

export interface ScoreResult {
    score_total: number;
    score_criteres_stricts: number;
    score_criteres_confort: number;
    criteres_stricts_matches: string[];
    criteres_confort_matches: string[];
    badges: string[];
}

export class ScoringService {
    calculateScore(ad: Ad, criteria: UserCriteria): ScoreResult {
        const stricts = criteria.criteres_stricts as ExtractedCriteria['criteres_stricts'];
        const confort = criteria.criteres_confort as ExtractedCriteria['criteres_confort'];

        let scoreStricts = 0;
        let scoreConfort = 0;
        const strictMatches: string[] = [];
        const confortMatches: string[] = [];
        const badges: string[] = [];

        // --- Strict Criteria ---
        let strictFail = false;

        // 1. Zone (30 pts)
        // Simple string matching for now. Can be improved with fuzzy matching or geo-coordinates.
        if (stricts.zones && stricts.zones.length > 0) {
            const adLocation = `${ad.ville} ${ad.quartier} ${ad.code_postal} ${ad.adresse_complete}`.toLowerCase();
            const zoneMatch = stricts.zones.some(z => adLocation.includes(z.toLowerCase()));
            if (zoneMatch) {
                scoreStricts += 30;
                strictMatches.push('Zone');
            } else {
                strictFail = true;
            }
        } else {
            // If no zone specified, we assume it matches (or we could penalize, but usually we want to show everything if unsure)
            scoreStricts += 30;
        }

        // 2. Budget (30 pts)
        if (stricts.budget_max) {
            if (ad.loyer_total && ad.loyer_total <= stricts.budget_max) {
                scoreStricts += 30;
                strictMatches.push('Budget');

                // Badge: Prix exceptionnel
                if (ad.loyer_total <= stricts.budget_max * 0.85) {
                    badges.push('💎 Prix exceptionnel');
                }
            } else if (!ad.loyer_total) {
                // If price is not available, don't fail but don't award points
                scoreStricts += 30; // Give benefit of doubt
            } else {
                strictFail = true;
            }
        } else {
            scoreStricts += 30;
        }

        // 3. Nombre de pièces (25 pts)
        if (stricts.nombre_pieces_min || stricts.nombre_pieces_max) {
            if (ad.nombre_pieces !== null) {
                let match = true;
                if (stricts.nombre_pieces_min && ad.nombre_pieces < stricts.nombre_pieces_min) match = false;
                if (stricts.nombre_pieces_max && ad.nombre_pieces > stricts.nombre_pieces_max) match = false;

                if (match) {
                    scoreStricts += 25;
                    strictMatches.push('Pièces');
                } else {
                    strictFail = true;
                }
            } else {
                // If number of pieces is not available, give benefit of doubt
                scoreStricts += 25;
            }
        } else {
            scoreStricts += 25;
        }

        // 4. Type logement (15 pts)
        if (stricts.type_logement && stricts.type_logement.length > 0) {
            if (ad.type_logement) {
                const typeMatch = stricts.type_logement.some(t => ad.type_logement!.toLowerCase().includes(t.toLowerCase()));
                if (typeMatch) {
                    scoreStricts += 15;
                    strictMatches.push('Type');
                } else {
                    strictFail = true;
                }
            } else {
                // If type is not available, give benefit of doubt
                scoreStricts += 15;
            }
        } else {
            scoreStricts += 15;
        }

        // If any strict criteria failed, score is 0
        if (strictFail) {
            return {
                score_total: 0,
                score_criteres_stricts: 0,
                score_criteres_confort: 0,
                criteres_stricts_matches: [],
                criteres_confort_matches: [],
                badges: []
            };
        }

        // --- Comfort Criteria (Max 30 pts) ---

        if (confort.dernier_etage && ad.dernier_etage) {
            scoreConfort += 5;
            confortMatches.push('Dernier étage');
        }
        if (confort.balcon && (ad.balcon || ad.terrasse)) {
            scoreConfort += 4;
            confortMatches.push('Balcon/Terrasse');
        }
        if (confort.meuble && ad.meuble) {
            scoreConfort += 4;
            confortMatches.push('Meublé');
        }
        if (confort.parking && ad.parking_inclus) {
            scoreConfort += 4;
            confortMatches.push('Parking');
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
            badges
        };
    }
}
