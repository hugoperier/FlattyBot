import * as readline from 'readline';
import { AdRepository } from '../repositories/ad.repository';
import { UserRepository } from '../repositories/user.repository';
import { ScoringService, ScoreResult } from '../services/scoring.service';
import { AdWithPost, UserCriteria } from '../types/database';
import { ExtractedCriteria } from '../services/openai.service';

interface FilterStats {
    total: number;
    accepted: number;
    rejected: number;
    rejectionReasons: Map<string, number>;
}

class FilterTester {
    private adRepo: AdRepository;
    private userRepo: UserRepository;
    private scoringService: ScoringService;
    private rl: readline.Interface;
    private currentPosts: AdWithPost[] = [];
    private currentIndex: number = 0;
    private selectedCriteria: UserCriteria | null = null;
    private stats: FilterStats = {
        total: 0,
        accepted: 0,
        rejected: 0,
        rejectionReasons: new Map()
    };

    constructor() {
        this.adRepo = new AdRepository();
        this.userRepo = new UserRepository();
        this.scoringService = new ScoringService();
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    private async selectUser(): Promise<boolean> {
        console.log('\n🔍 Chargement des utilisateurs avec critères...\n');

        const users = await this.userRepo.getAllActiveUsers();

        if (users.length === 0) {
            console.log('❌ Aucun utilisateur actif trouvé.');
            return false;
        }

        const usersWithCriteria: Array<{ user: any, criteria: UserCriteria }> = [];

        for (const user of users) {
            const criteria = await this.userRepo.getCriteria(user.telegram_id);
            if (criteria) {
                usersWithCriteria.push({ user, criteria });
            }
        }

        if (usersWithCriteria.length === 0) {
            console.log('❌ Aucun utilisateur avec critères trouvé.');
            return false;
        }

        console.log('📋 Utilisateurs disponibles:\n');
        usersWithCriteria.forEach((item, index) => {
            console.log(`${index + 1}. User ID: ${item.user.telegram_id}`);
            console.log(`   Résumé: ${item.criteria.resume_humain || 'N/A'}`);
            console.log('');
        });

        const userChoice = await this.prompt('Sélectionnez un utilisateur (numéro): ');
        const selectedIndex = parseInt(userChoice) - 1;

        if (selectedIndex < 0 || selectedIndex >= usersWithCriteria.length) {
            console.log('❌ Sélection invalide.');
            return false;
        }

        this.selectedCriteria = usersWithCriteria[selectedIndex].criteria;

        console.log('\n✅ Critères chargés:');
        console.log(`📝 ${this.selectedCriteria.resume_humain}`);
        this.displayCriteria(this.selectedCriteria);

        return true;
    }

    private displayCriteria(criteria: UserCriteria) {
        const stricts = criteria.criteres_stricts as ExtractedCriteria['criteres_stricts'];
        const confort = criteria.criteres_confort as ExtractedCriteria['criteres_confort'];

        console.log('\n🎯 Critères Stricts:');
        if (stricts.zones && stricts.zones.length > 0) {
            console.log(`   📍 Zones: ${stricts.zones.join(', ')}`);
        }
        if (stricts.budget_max) {
            console.log(`   💰 Budget max: CHF ${stricts.budget_max}`);
        }
        if (stricts.nombre_pieces_min || stricts.nombre_pieces_max) {
            const min = stricts.nombre_pieces_min || '?';
            const max = stricts.nombre_pieces_max || '?';
            console.log(`   🏠 Pièces: ${min} - ${max}`);
        }
        if (stricts.type_logement && stricts.type_logement.length > 0) {
            console.log(`   🏢 Type: ${stricts.type_logement.join(', ')}`);
        }

        console.log('\n⭐ Critères Confort:');
        if (confort.dernier_etage) console.log('   ✅ Dernier étage');
        if (confort.balcon) console.log('   ✅ Balcon');
        if (confort.meuble) console.log('   ✅ Meublé');
        if (confort.parking) console.log('   ✅ Parking');
    }

    private async loadPosts(hours: number): Promise<boolean> {
        console.log(`\n🔄 Chargement des posts des dernières ${hours}h...\n`);

        this.currentPosts = await this.adRepo.getRecentAds(hours);

        if (this.currentPosts.length === 0) {
            console.log('❌ Aucun post trouvé dans cette période.');
            return false;
        }

        console.log(`✅ ${this.currentPosts.length} posts trouvés.\n`);
        this.currentIndex = 0;

        return true;
    }

    private displayPost(post: AdWithPost, score: ScoreResult) {
        console.clear();
        console.log('═══════════════════════════════════════════════════════════════');
        console.log(`📍 Post ${this.currentIndex + 1}/${this.currentPosts.length}`);
        console.log('═══════════════════════════════════════════════════════════════\n');

        // Informations essentielles
        console.log('🏠 INFORMATIONS:');
        console.log(`   Adresse: ${post.adresse_complete || 'N/A'}`);
        console.log(`   Ville: ${post.ville || 'N/A'} ${post.code_postal || ''}`);
        console.log(`   Quartier: ${post.quartier || 'N/A'}`);
        console.log(`   Type: ${post.type_logement || 'N/A'}`);
        console.log(`   Pièces: ${post.nombre_pieces !== null ? post.nombre_pieces : 'N/A'}`);
        console.log(`   Surface: ${post.surface_m2 ? post.surface_m2 + 'm²' : 'N/A'}`);
        console.log(`   Loyer total: ${post.loyer_total ? 'CHF ' + post.loyer_total : 'N/A'}`);
        console.log(`   Disponibilité: ${post.date_disponibilite || 'N/A'}`);
        console.log(`   Publié: ${new Date(post.facebook_posts.time_posted).toLocaleString('fr-CH')}`);

        console.log('\n📊 SCORING:');
        console.log(`   Score Total: ${score.score_total}/130`);
        console.log(`   Score Strict: ${score.score_criteres_stricts}/100`);
        console.log(`   Score Confort: ${score.score_criteres_confort}/30`);

        if (score.badges.length > 0) {
            console.log(`   Badges: ${score.badges.join(' ')}`);
        }

        // Résultat
        if (score.score_total === 0) {
            console.log('\n❌ REJETÉ');
            this.displayRejectionReason(post, score);
        } else {
            console.log('\n✅ ACCEPTÉ');
            this.displaySuccessDetails(score);
        }

        console.log('\n───────────────────────────────────────────────────────────────');
        console.log('Commandes: [n]ext | [p]rev | [s]ummary | [q]uit');
        console.log('───────────────────────────────────────────────────────────────');
    }

    private displayRejectionReason(post: AdWithPost, score: ScoreResult) {
        if (!this.selectedCriteria) return;

        const stricts = this.selectedCriteria.criteres_stricts as ExtractedCriteria['criteres_stricts'];
        const reasons: string[] = [];

        console.log('\n🔍 Analyse des Critères Stricts:');

        // Zone
        if (stricts.zones && stricts.zones.length > 0) {
            const adLocation = `${post.ville} ${post.quartier} ${post.code_postal} ${post.adresse_complete}`.toLowerCase();
            const zoneMatch = stricts.zones.some(z => adLocation.includes(z.toLowerCase()));
            if (zoneMatch) {
                console.log(`   ✅ Zone: Recherché [${stricts.zones.join(', ')}] - Trouvé dans "${adLocation}"`);
            } else {
                console.log(`   ❌ Zone: Recherché [${stricts.zones.join(', ')}] - Pas trouvé dans "${adLocation}"`);
                reasons.push('Zone non correspondante');
            }
        }

        // Budget
        if (stricts.budget_max) {
            if (post.loyer_total) {
                if (post.loyer_total <= stricts.budget_max) {
                    console.log(`   ✅ Budget: CHF ${post.loyer_total} ≤ CHF ${stricts.budget_max}`);
                } else {
                    console.log(`   ❌ Budget: CHF ${post.loyer_total} > CHF ${stricts.budget_max}`);
                    reasons.push(`Budget dépassé (CHF ${post.loyer_total} > CHF ${stricts.budget_max})`);
                }
            } else {
                console.log(`   ⚠️  Budget: Prix non disponible (accordé par défaut)`);
            }
        }

        // Pièces
        if (stricts.nombre_pieces_min || stricts.nombre_pieces_max) {
            if (post.nombre_pieces !== null) {
                let match = true;
                let reason = '';
                if (stricts.nombre_pieces_min && post.nombre_pieces < stricts.nombre_pieces_min) {
                    match = false;
                    reason = `trop peu (${post.nombre_pieces} < ${stricts.nombre_pieces_min})`;
                }
                if (stricts.nombre_pieces_max && post.nombre_pieces > stricts.nombre_pieces_max) {
                    match = false;
                    reason = `trop (${post.nombre_pieces} > ${stricts.nombre_pieces_max})`;
                }

                if (match) {
                    console.log(`   ✅ Pièces: ${post.nombre_pieces} dans la plage [${stricts.nombre_pieces_min || '?'}-${stricts.nombre_pieces_max || '?'}]`);
                } else {
                    console.log(`   ❌ Pièces: ${reason}`);
                    reasons.push(`Nombre de pièces ${reason}`);
                }
            } else {
                console.log(`   ⚠️  Pièces: Non disponible (accordé par défaut)`);
            }
        }

        // Type
        if (stricts.type_logement && stricts.type_logement.length > 0) {
            if (post.type_logement) {
                const typeMatch = stricts.type_logement.some(t => post.type_logement!.toLowerCase().includes(t.toLowerCase()));
                if (typeMatch) {
                    console.log(`   ✅ Type: "${post.type_logement}" correspond à [${stricts.type_logement.join(', ')}]`);
                } else {
                    console.log(`   ❌ Type: "${post.type_logement}" ne correspond pas à [${stricts.type_logement.join(', ')}]`);
                    reasons.push(`Type de logement non correspondant`);
                }
            } else {
                console.log(`   ⚠️  Type: Non disponible (accordé par défaut)`);
            }
        }

        if (reasons.length > 0) {
            console.log(`\n💥 Raison(s) du rejet: ${reasons.join(', ')}`);

            // Track reasons
            reasons.forEach(reason => {
                const count = this.stats.rejectionReasons.get(reason) || 0;
                this.stats.rejectionReasons.set(reason, count + 1);
            });
        }
    }

    private displaySuccessDetails(score: ScoreResult) {
        console.log('\n✅ Critères Stricts Validés:');
        if (score.criteres_stricts_matches.length > 0) {
            score.criteres_stricts_matches.forEach(match => {
                console.log(`   ✅ ${match}`);
            });
        }

        if (score.criteres_confort_matches.length > 0) {
            console.log('\n⭐ Critères Confort Validés:');
            score.criteres_confort_matches.forEach(match => {
                console.log(`   ✅ ${match}`);
            });
        }
    }

    private displayStats() {
        console.clear();
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('📊 STATISTIQUES GLOBALES');
        console.log('═══════════════════════════════════════════════════════════════\n');

        console.log(`Total de posts analysés: ${this.stats.total}`);
        console.log(`✅ Posts acceptés: ${this.stats.accepted} (${this.stats.total > 0 ? Math.round(this.stats.accepted / this.stats.total * 100) : 0}%)`);
        console.log(`❌ Posts rejetés: ${this.stats.rejected} (${this.stats.total > 0 ? Math.round(this.stats.rejected / this.stats.total * 100) : 0}%)`);

        if (this.stats.rejectionReasons.size > 0) {
            console.log('\n📋 Raisons de rejet:');
            Array.from(this.stats.rejectionReasons.entries())
                .sort((a, b) => b[1] - a[1])
                .forEach(([reason, count]) => {
                    console.log(`   ${reason}: ${count}`);
                });
        }

        console.log('\n───────────────────────────────────────────────────────────────');
    }

    private async navigate() {
        while (true) {
            if (this.currentIndex < 0 || this.currentIndex >= this.currentPosts.length) {
                this.currentIndex = Math.max(0, Math.min(this.currentIndex, this.currentPosts.length - 1));
            }

            const post = this.currentPosts[this.currentIndex];
            const score = this.scoringService.calculateScore(post, this.selectedCriteria!);

            // Update stats
            this.stats.total = this.currentPosts.length;
            this.stats.accepted = this.currentPosts.filter((p, idx) => {
                if (idx <= this.currentIndex) {
                    const s = this.scoringService.calculateScore(p, this.selectedCriteria!);
                    return s.score_total > 0;
                }
                return false;
            }).length;
            this.stats.rejected = (this.currentIndex + 1) - this.stats.accepted;

            this.displayPost(post, score);

            const input = await this.prompt('> ');
            const cmd = input.toLowerCase().trim();

            if (cmd === 'n' || cmd === 'next') {
                if (this.currentIndex < this.currentPosts.length - 1) {
                    this.currentIndex++;
                } else {
                    console.log('❌ Dernier post atteint.');
                    await this.prompt('Appuyez sur Entrée pour continuer...');
                }
            } else if (cmd === 'p' || cmd === 'prev') {
                if (this.currentIndex > 0) {
                    this.currentIndex--;
                } else {
                    console.log('❌ Premier post atteint.');
                    await this.prompt('Appuyez sur Entrée pour continuer...');
                }
            } else if (cmd === 's' || cmd === 'summary') {
                // Calculate all stats
                this.stats.total = this.currentPosts.length;
                this.stats.accepted = 0;
                this.stats.rejected = 0;
                this.stats.rejectionReasons.clear();

                this.currentPosts.forEach(p => {
                    const s = this.scoringService.calculateScore(p, this.selectedCriteria!);
                    if (s.score_total > 0) {
                        this.stats.accepted++;
                    } else {
                        this.stats.rejected++;
                        // Add rejection reasons
                        this.displayRejectionReason(p, s); // This will populate rejectionReasons
                    }
                });

                this.displayStats();
                await this.prompt('\nAppuyez sur Entrée pour continuer...');
            } else if (cmd === 'q' || cmd === 'quit') {
                break;
            }
        }
    }

    private prompt(question: string): Promise<string> {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer);
            });
        });
    }

    async run() {
        console.log('╔═══════════════════════════════════════════════════════════════╗');
        console.log('║         🔍 FILTER TESTER - FlattyBot                         ║');
        console.log('╚═══════════════════════════════════════════════════════════════╝\n');

        // Step 1: Select user
        if (!await this.selectUser()) {
            this.rl.close();
            return;
        }

        // Step 2: Configure time range
        const hoursInput = await this.prompt('\nPériode de recherche en heures (défaut: 6): ');
        const hours = parseInt(hoursInput) || 6;

        // Step 3: Load posts
        if (!await this.loadPosts(hours)) {
            this.rl.close();
            return;
        }

        // Step 4: Navigate
        await this.navigate();

        console.log('\n👋 Au revoir!\n');
        this.rl.close();
    }
}

// Run the application
const tester = new FilterTester();
tester.run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
