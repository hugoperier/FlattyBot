import * as fs from 'fs';
import * as path from 'path';

interface ProximityData {
    [key: string]: string[];
}

export class ProximityGraph {
    private data: ProximityData;

    constructor() {
        const filePath = path.join(process.cwd(), 'src', 'data', 'proximity.json');
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        this.data = JSON.parse(fileContent);
    }

    public hasNode(name: string): boolean {
        return Object.prototype.hasOwnProperty.call(this.data, name);
    }

    public getAllNodes(): string[] {
        return Object.keys(this.data);
    }

    public getNeighbors(name: string): string[] {
        return this.data[name] || [];
    }
}
