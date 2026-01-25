import * as fs from 'fs';
import * as path from 'path';
import { Ad } from '../types/database';

interface LocationData {
    metadata: {
        description: string;
        version: string;
        last_updated: string;
        purpose: string;
        notes: string;
    };
    lieux_canoniques: {
        communes: string[];
        quartiers_intra_muros: string[];
        lieux_dits_historiques: string[];
        villes_hors_canton: string[];
    };
    mapping: {
        variantes_orthographiques: { [key: string]: string[] };
        termes_vagues_geographiques: { [key: string]: string[] };
        noms_infrastructures_majeures: { [key: string]: string[] };
        lieux_dits_historiques: { [key: string]: string[] };
        secteurs_administratifs_detailles: { [key: string]: string[] };
        codes_postaux: { [key: string]: string[] };
        villes_hors_canton: { [key: string]: string[] };
        mapping_exclusif_geneve: { [key: string]: string[] };
    };
}

export class LocationRepository {
    private data: LocationData;
    private canonicalLocations: Set<string>;
    private dbTermsMapping: { [key: string]: string };
    private lookupMap: Map<string, Set<string>>;
    private exclusiveGenevaMap: Map<string, Set<string>>;

    constructor() {
        const filePath = path.join(process.cwd(), 'src', 'data', 'known_locations.json');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        this.data = JSON.parse(fileContent);

        const dbMappingPath = path.join(process.cwd(), 'src', 'data', 'db_terms_mapping.json');
        const dbMappingContent = fs.readFileSync(dbMappingPath, 'utf-8');
        this.dbTermsMapping = JSON.parse(dbMappingContent);

        this.canonicalLocations = this.loadCanonicalLocations();
        this.lookupMap = this.buildLookupMap();
        this.exclusiveGenevaMap = this.buildExclusiveGenevaMap();
    }

    private loadCanonicalLocations(): Set<string> {
        const locations = new Set<string>();

        this.data.lieux_canoniques.communes.forEach(loc => locations.add(loc));
        this.data.lieux_canoniques.quartiers_intra_muros.forEach(loc => locations.add(loc));
        this.data.lieux_canoniques.lieux_dits_historiques.forEach(loc => locations.add(loc));
        this.data.lieux_canoniques.villes_hors_canton.forEach(loc => locations.add(loc));

        return locations;
    }

    public getCanonicalLocations(): Set<string> {
        return this.canonicalLocations;
    }

    public getMappingTargets(): { source: string, target: string, context: string }[] {
        const targets: { source: string, target: string, context: string }[] = [];

        const processMappingSection = (sectionName: string, sectionData: { [key: string]: string[] }) => {
            for (const [key, values] of Object.entries(sectionData)) {
                values.forEach(value => {
                    targets.push({
                        source: key,
                        target: value,
                        context: `mapping.${sectionName}`
                    });
                });
            }
        };

        processMappingSection('variantes_orthographiques', this.data.mapping.variantes_orthographiques);
        processMappingSection('termes_vagues_geographiques', this.data.mapping.termes_vagues_geographiques);
        processMappingSection('noms_infrastructures_majeures', this.data.mapping.noms_infrastructures_majeures);
        processMappingSection('lieux_dits_historiques', this.data.mapping.lieux_dits_historiques);
        processMappingSection('secteurs_administratifs_detailles', this.data.mapping.secteurs_administratifs_detailles);
        processMappingSection('codes_postaux', this.data.mapping.codes_postaux);
        processMappingSection('villes_hors_canton', this.data.mapping.villes_hors_canton);
        processMappingSection('mapping_exclusif_geneve', this.data.mapping.mapping_exclusif_geneve);

        return targets;
    }

    public validateInternalConsistency(): string[] {
        const errors: string[] = [];
        const targets = this.getMappingTargets();

        for (const { source, target, context } of targets) {
            if (!this.canonicalLocations.has(target)) {
                errors.push(`Invalid target location "${target}" referenced in "${context}" for key "${source}"`);
            }
        }

        return errors;
    }

    public validateDbTermsConsistency(): string[] {
        const errors: string[] = [];
        for (const [term, target] of Object.entries(this.dbTermsMapping)) {
            if (!this.canonicalLocations.has(target)) {
                errors.push(`[INVALID DB TARGET] Term "${term}" maps to "${target}", which is NOT a canonical location.`);
            }
        }
        return errors;
    }

    private buildLookupMap(): Map<string, Set<string>> {
        const map = new Map<string, Set<string>>();

        // Helper to add to map
        const add = (key: string, value: string) => {
            const normalizedKey = key.toLowerCase().trim();
            if (!map.has(normalizedKey)) {
                map.set(normalizedKey, new Set());
            }
            map.get(normalizedKey)!.add(value);
        };

        // 1. Add Canonical Locations themselves (Identity mapping)
        this.canonicalLocations.forEach(loc => {
            add(loc, loc);
        });

        // 2. Add Mappings from JSON
        const mappingSections = [
            this.data.mapping.variantes_orthographiques,
            this.data.mapping.termes_vagues_geographiques,
            this.data.mapping.noms_infrastructures_majeures,
            this.data.mapping.lieux_dits_historiques,
            this.data.mapping.secteurs_administratifs_detailles,
            this.data.mapping.codes_postaux,
            this.data.mapping.villes_hors_canton
        ];

        for (const section of mappingSections) {
            for (const [key, targets] of Object.entries(section)) {
                targets.forEach(target => {
                    // Only add if target is actually a valid canonical location
                    if (this.canonicalLocations.has(target)) {
                        add(key, target);
                    }
                });
            }
        }

        // 3. Add DB Terms Mapping
        for (const [term, target] of Object.entries(this.dbTermsMapping)) {
            if (this.canonicalLocations.has(target)) {
                add(term, target);
            }
        }

        return map;
    }

    private buildExclusiveGenevaMap(): Map<string, Set<string>> {
        const map = new Map<string, Set<string>>();
        const section = this.data.mapping.mapping_exclusif_geneve;

        if (!section) return map;

        for (const [key, targets] of Object.entries(section)) {
            const normalizedKey = key.toLowerCase().trim();
            if (!map.has(normalizedKey)) {
                map.set(normalizedKey, new Set());
            }
            targets.forEach(target => {
                if (this.canonicalLocations.has(target)) {
                    map.get(normalizedKey)!.add(target);
                }
            });
        }
        return map;
    }

    /**
     * Tries to find canonical locations from a user string or db string.
     * Returns a list of potential canonical matches.
     */
    public findCanonical(input: string, isGeneva: boolean = false): string[] {
        if (!input) return [];
        const normalized = input.toLowerCase().trim();

        const matches = new Set<string>();

        // 1. Standard matches
        const primaryMatches = this.lookupMap.get(normalized);
        if (primaryMatches) {
            primaryMatches.forEach(m => matches.add(m));
        }

        // 2. Exclusive Geneva matches (only if context is Geneva)
        if (isGeneva) {
            const exclusiveMatches = this.exclusiveGenevaMap.get(normalized);
            if (exclusiveMatches) {
                exclusiveMatches.forEach(m => matches.add(m));
            }
        }

        return Array.from(matches);
    }

    /**
     * Resolves an Ad's location to a list of canonical locations.
     * Priority: Quartier > Ville.
     */
    public resolveAdLocation(ad: Ad, isGeneva: boolean = false): string[] {
        // 1. Try Quartier
        if (ad.quartier) {
            const matches = this.findCanonical(ad.quartier, isGeneva);
            if (matches.length > 0) return matches;
        }

        // 2. Try Code Postal
        if (ad.code_postal) {
            const matches = this.findCanonical(ad.code_postal.toString(), isGeneva);
            if (matches.length > 0) return matches;
        }

        // 3. Try Ville
        if (ad.ville) {
            const matches = this.findCanonical(ad.ville, isGeneva);
            if (matches.length > 0) return matches;
        }

        return [];
    }
}
