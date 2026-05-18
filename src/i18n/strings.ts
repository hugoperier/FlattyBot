export type Lang = 'fr' | 'en';

type StringsMap = Record<string, string | ((...args: any[]) => string)>;

const STRINGS: Record<Lang, StringsMap> = {
    fr: {
        // Language step
        lang_prompt: '🌍 Dans quelle langue veux-tu que je communique ?\n\nWhich language do you prefer?',
        lang_fr: '🇫🇷 Français',
        lang_en: '🇬🇧 English',

        // Welcome
        welcome_new: (example: string) =>
            `👋 Salut ! Je suis **FlattyBot**.\n\nJe surveille les annonces de location à Genève et t'alerte dès qu'une correspond à ta recherche. 🏠\n\nDis-moi ce que tu cherches en quelques phrases.\n_Exemple : "${example}"_`,
        welcome_example: '3 pièces à Carouge ou Plainpalais, max 2500 CHF, balcon si possible',
        welcome_update:
            '🔄 **Modifier ta recherche**\n\nDis-moi ce que tu veux changer, ou reformule entièrement.\n_Ex : "monte à 2800 CHF" / "aussi le Lignon" / "finalement appartement seulement"_',

        // Extraction
        analyzing: '🔍 J\'analyse ta demande… (quelques secondes)',
        ask_missing: (question: string) => question,
        ask_missing_fallback: (fields: string) =>
            `Il me manque encore quelques infos pour affiner ta recherche :\n${fields}\n\nPeux-tu me préciser ça ?`,
        cancel_btn: '❌ Annuler',
        q_budget: '💰 Quel est ton **budget maximum** par mois (en CHF) ?',
        q_pieces: '🛏 Tu cherches **combien de pièces** minimum ?',
        q_avail: '📅 **Pour quand** cherches-tu à emménager ?',
        pieces_any: '🤷 Peu importe',
        avail_asap: '🔥 Le plus tôt possible',
        avail_1m: '📅 Dans 1 mois',
        avail_2m: '🗓 Dans 2 mois',
        avail_flexible: '🔍 Pas de contrainte',

        // Fallback (3 rounds)
        fallback_msg:
            '😅 J\'ai du mal à obtenir toutes les infos dont j\'ai besoin. On peut quand même continuer avec ce que tu m\'as donné, ou tu peux tout recommencer.',
        fallback_continue_btn: '▶️ Continuer quand même',
        fallback_restart_btn: '🔄 Tout recommencer',

        // Housing type
        housing_question: '🏡 **Quel type de logement cherches-tu ?**',
        housing_appart: '🏢 Appartement entier',
        housing_coloc: '🛏️ Colocation / Chambre',
        housing_all: '🤷 Les deux m\'intéressent',
        housing_detected: (label: string) => `🏡 Type de logement identifié : **${label}**`,

        // Recap
        recap_confirm_btn: '✅ Confirmer',
        recap_modify_btn: '✏️ Modifier',
        recap_restart_btn: '🔄 Recommencer',
        recap_header: '📋 **Récapitulatif de ta recherche**',

        // Modify step
        modify_prompt: 'Qu\'est-ce que tu veux modifier ? Dis-moi en une phrase.',

        // Location suggestion
        loc_verified: (zones: string) => `J'ai bien noté ta recherche pour : **${zones}**.`,
        loc_suggestion: (suggestions: string) =>
            `💡 Pour ne rien rater, je te suggère d'inclure aussi les zones limitrophes : **${suggestions}**.\n\nOn garde tout ?`,
        loc_all_btn: '✅ Oui, tout inclure',
        loc_strict_btn: '🎯 Non, seulement ma sélection',
        loc_modify_btn: '✏️ Modifier les zones',
        loc_unknown: (zones: string) =>
            `⚠️ **Lieu(x) inconnu(s)**\n\nJe ne connais pas : **${zones}**.\nPeux-tu vérifier l'orthographe ou préciser le quartier ? (Je couvre uniquement Genève.)`,

        // Market check
        market_checking: '📊 Je regarde le volume d\'annonces sur les 2 dernières semaines…',
        market_good: (count: number) =>
            `📊 **Marché actuel** : ${count} annonce${count > 1 ? 's' : ''} correspondraient à ta recherche ces 2 dernières semaines. C'est un bon signe ! 🎯`,
        market_low: (count: number) =>
            `📊 **Marché actuel** : seulement ${count} annonce${count > 1 ? 's' : ''} sur 2 semaines. Ta recherche est peut-être un peu stricte.\n💡 Tu peux élargir tes critères si tu veux plus de résultats.`,
        market_empty:
            '📊 **Marché actuel** : aucune annonce ne correspond à ta recherche sur 2 semaines. Je te suggère d\'élargir tes critères (budget, zones ou type de logement).',
        market_continue_btn: '▶️ Surveiller quand même',
        market_modify_btn: '✏️ Élargir mes critères',

        // Preview (catchup)
        preview_header: (total: number, shown: number) =>
            `🔎 **Aperçu des dernières 48h**\nJ'ai trouvé ${total} annonce${total > 1 ? 's' : ''} récente${total > 1 ? 's' : ''} qui correspondent. Voici les ${shown} meilleures :`,
        preview_empty:
            '🔎 Rien dans les dernières 48h — mais ne t\'inquiète pas, je commence ma veille dès maintenant !',

        // Final
        final_msg:
            '🎯 **Surveillance activée !**\n\nJe t\'alerterai dès qu\'une nouvelle annonce correspondra à ta recherche. Les alertes arriveront généralement en moins de 5 minutes après publication.\n\n_Fais /menu pour gérer tes préférences._',
    },

    en: {
        // Language step
        lang_prompt: '🌍 Dans quelle langue veux-tu que je communique ?\n\nWhich language do you prefer?',
        lang_fr: '🇫🇷 Français',
        lang_en: '🇬🇧 English',

        // Welcome
        welcome_new: (example: string) =>
            `👋 Hi! I'm **FlattyBot**.\n\nI monitor Geneva rental listings and notify you as soon as one matches your search. 🏠\n\nTell me what you're looking for in a few sentences.\n_Example: "${example}"_`,
        welcome_example: '3-room apartment in Carouge or Plainpalais, max 2500 CHF, balcony if possible',
        welcome_update:
            '🔄 **Update your search**\n\nTell me what you want to change, or rephrase entirely.\n_E.g. "raise budget to 2800 CHF" / "also include Le Lignon" / "apartments only now"_',

        // Extraction
        analyzing: '🔍 Analyzing your request… (a few seconds)',
        ask_missing: (question: string) => question,
        ask_missing_fallback: (fields: string) =>
            `I still need a few details:\n${fields}\n\nCould you clarify?`,
        cancel_btn: '❌ Cancel',
        q_budget: '💰 What\'s your **maximum monthly budget** (in CHF)?',
        q_pieces: '🛏 **How many rooms** are you looking for?',
        q_avail: '📅 **When** do you want to move in?',
        pieces_any: '🤷 No preference',
        avail_asap: '🔥 As soon as possible',
        avail_1m: '📅 In 1 month',
        avail_2m: '🗓 In 2 months',
        avail_flexible: '🔍 No constraint',

        // Fallback (3 rounds)
        fallback_msg:
            '😅 I\'m having trouble gathering all the details. We can continue with what you\'ve given me, or start over.',
        fallback_continue_btn: '▶️ Continue anyway',
        fallback_restart_btn: '🔄 Start over',

        // Housing type
        housing_question: '🏡 **What type of accommodation are you looking for?**',
        housing_appart: '🏢 Whole apartment',
        housing_coloc: '🛏️ Flatshare / Room',
        housing_all: '🤷 Both interest me',
        housing_detected: (label: string) => `🏡 Housing type detected: **${label}**`,

        // Recap
        recap_confirm_btn: '✅ Confirm',
        recap_modify_btn: '✏️ Edit',
        recap_restart_btn: '🔄 Start over',
        recap_header: '📋 **Search summary**',

        // Modify step
        modify_prompt: 'What would you like to change? Tell me in one sentence.',

        // Location suggestion
        loc_verified: (zones: string) => `I noted your search for: **${zones}**.`,
        loc_suggestion: (suggestions: string) =>
            `💡 To make sure you don't miss anything, I suggest including nearby areas too: **${suggestions}**.\n\nInclude them all?`,
        loc_all_btn: '✅ Yes, include all',
        loc_strict_btn: '🎯 No, only my selection',
        loc_modify_btn: '✏️ Edit zones',
        loc_unknown: (zones: string) =>
            `⚠️ **Unknown location(s)**\n\nI don't recognise: **${zones}**.\nCould you check the spelling or be more specific? (I only cover Geneva.)`,

        // Market check
        market_checking: '📊 Checking listing volume over the last 2 weeks…',
        market_good: (count: number) =>
            `📊 **Current market**: ${count} listing${count > 1 ? 's' : ''} would match your search over the past 2 weeks. Looking good! 🎯`,
        market_low: (count: number) =>
            `📊 **Current market**: only ${count} listing${count > 1 ? 's' : ''} over 2 weeks. Your search might be a bit strict.\n💡 You can broaden your criteria to get more results.`,
        market_empty:
            '📊 **Current market**: no listings match your search over 2 weeks. Consider broadening your criteria (budget, zones, or housing type).',
        market_continue_btn: '▶️ Monitor anyway',
        market_modify_btn: '✏️ Broaden criteria',

        // Preview (catchup)
        preview_header: (total: number, shown: number) =>
            `🔎 **Last 48h preview**\nFound ${total} recent listing${total > 1 ? 's' : ''} matching your criteria. Here are the top ${shown}:`,
        preview_empty:
            '🔎 Nothing in the last 48h — but don\'t worry, I\'m watching from now on!',

        // Final
        final_msg:
            '🎯 **Monitoring activated!**\n\nI\'ll alert you as soon as a new listing matches your search. Alerts typically arrive within 5 minutes of publication.\n\n_Use /menu to manage your preferences._',
    },
};

export function t(lang: Lang, key: string, ...args: any[]): string {
    const dict = STRINGS[lang] ?? STRINGS.fr;
    const entry = dict[key] ?? STRINGS.fr[key];
    if (!entry) return key;
    if (typeof entry === 'function') return entry(...args);
    return entry as string;
}
