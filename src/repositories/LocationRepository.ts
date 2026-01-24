import * as fs from 'fs';
import * as path from 'path';

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
    };
    mapping: {
        variantes_orthographiques: { [key: string]: string[] };
        termes_vagues_geographiques: { [key: string]: string[] };
        noms_infrastructures_majeures: { [key: string]: string[] };
        lieux_dits_historiques: { [key: string]: string[] };
        secteurs_administratifs_detailles: { [key: string]: string[] };
    };
}

export class LocationRepository {
    private data: LocationData;
    private canonicalLocations: Set<string>;

    constructor() {
        const filePath = path.join(process.cwd(), 'src', 'data', 'known_locations.json');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        this.data = JSON.parse(fileContent);
        this.canonicalLocations = this.loadCanonicalLocations();
    }

    private loadCanonicalLocations(): Set<string> {
        const locations = new Set<string>();

        this.data.lieux_canoniques.communes.forEach(loc => locations.add(loc));
        this.data.lieux_canoniques.quartiers_intra_muros.forEach(loc => locations.add(loc));
        this.data.lieux_canoniques.lieux_dits_historiques.forEach(loc => locations.add(loc));

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
}
