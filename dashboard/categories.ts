export type Category = {
  id: string;
  label: string;
  color: string;
};

export const CATEGORIES: Record<string, Category> = {
  groceries:     { id: 'groceries',     label: 'Groceries & Supermarkets', color: '#22c55e' },
  restaurants:   { id: 'restaurants',   label: 'Restaurants & Cafes',      color: '#f97316' },
  transport:     { id: 'transport',     label: 'Transport & Fuel',          color: '#3b82f6' },
  health:        { id: 'health',        label: 'Health & Pharmacy',         color: '#ec4899' },
  utilities:     { id: 'utilities',     label: 'Utilities & Telecom',       color: '#f59e0b' },
  subscriptions: { id: 'subscriptions', label: 'Subscriptions',             color: '#8b5cf6' },
  shopping:      { id: 'shopping',      label: 'Shopping & Fashion',        color: '#06b6d4' },
  entertainment: { id: 'entertainment', label: 'Entertainment',             color: '#a855f7' },
  atm:           { id: 'atm',           label: 'ATM & Cash',                color: '#94a3b8' },
  transfers:     { id: 'transfers',     label: 'Transfers',                 color: '#64748b' },
  other:         { id: 'other',         label: 'Other',                     color: '#475569' },
};

const RULES: Array<{ patterns: RegExp[]; category: string }> = [
  // Groceries & Supermarkets
  {
    category: 'groceries',
    patterns: [
      /רמי לוי/i, /שופרסל/i, /שפרסל/i, /מגה/i, /יינות ביתן/i, /ביתן/i,
      /ויקטורי/i, /סיטי מרקט/i, /am.?pm/i, /tiv taam/i, /טיב טעם/i,
      /osher ad/i, /אושר עד/i, /super.?pharm/i, /חצי חינם/i, /freshmarket/i,
      /מכולת/i, /מינימרקט/i, /minimarket/i, /corner store/i,
    ],
  },
  // Restaurants, Cafes & Food delivery
  {
    category: 'restaurants',
    patterns: [
      /מקדונלד/i, /mcdonalds/i, /בורגר/i, /burger/i, /פיצה/i, /pizza/i,
      /סושי/i, /sushi/i, /wolt/i, /ten bis/i, /tenbis/i, /mishloha/i,
      /mishloha/i, /coffee/i, /קפה/i, /cafe/i, /greg/i, /aroma/i, /ארומה/i,
      /cofix/i, /קופיקס/i, /pasta/i, /שווארמה/i, /פלאפל/i, /hummus/i,
      /starbucks/i, /subway/i, /kfc/i, /dominos/i, /shawarma/i,
    ],
  },
  // Transport & Fuel
  {
    category: 'transport',
    patterns: [
      /פז/i, /paz /i, /סונול/i, /sonol/i, /דלק/i, /delek/i, /ten /i,
      /פדרוב/i, /yellowpin/i, /רב.?קו/i, /rav.?kav/i, /גט/i, /gett/i,
      /uber/i, /bolt/i, /waze/i, /parking/i, /חניה/i, /נסיעה/i,
      /אוטובוס/i, /רכבת/i, /israel railways/i,
    ],
  },
  // Health & Pharmacy
  {
    category: 'health',
    patterns: [
      /super.?pharm/i, /סופר פארם/i, /סופרפארם/i, /new pharm/i,
      /כללית/i, /maccabi/i, /מכבי/i, /מאוחדת/i, /leumit/i, /לאומית/i,
      /pharmacy/i, /בית מרקחת/i, /רוקח/i, /רופא/i, /doctor/i, /clinic/i,
      /dental/i, /שיניים/i, /optic/i, /אופטיקה/i,
    ],
  },
  // Utilities & Telecom
  {
    category: 'utilities',
    patterns: [
      /hot/i, /yes /i, /bezeq/i, /בזק/i, /cellcom/i, /סלקום/i,
      /partner/i, /פרטנר/i, /orange/i, /012/i, /013/i, /019/i,
      /חברת חשמל/i, /electricity/i, /water authority/i, /מים/i,
      /municipal/i, /עירייה/i, /arnona/i, /ארנונה/i, /gas/i, /גז/i,
    ],
  },
  // Subscriptions & Digital services
  {
    category: 'subscriptions',
    patterns: [
      /netflix/i, /spotify/i, /apple/i, /icloud/i, /google/i, /youtube/i,
      /amazon/i, /amazon prime/i, /hbo/i, /disney/i, /microsoft/i,
      /adobe/i, /dropbox/i, /notion/i, /slack/i, /zoom/i, /chatgpt/i,
      /openai/i, /claude/i, /anthropic/i,
    ],
  },
  // Shopping & Fashion
  {
    category: 'shopping',
    patterns: [
      /zara/i, /h&m/i, /hm.co/i, /golf/i, /castro/i, /renuar/i,
      /terminal.?x/i, /fox/i, /next/i, /primark/i, /aliexpress/i,
      /ebay/i, /ikea/i, /ace/i, /homecenter/i, /ksp/i, /bug/i,
      /ivory/i, /shein/i,
    ],
  },
  // Entertainment
  {
    category: 'entertainment',
    patterns: [
      /cinema/i, /סינמה/i, /yes planet/i, /rav hen/i, /רב חן/i,
      /theater/i, /תיאטרון/i, /museum/i, /מוזיאון/i, /concert/i,
      /escape room/i, /bowling/i, /sport/i, /ספורט/i, /gym/i,
    ],
  },
  // ATM & Cash
  {
    category: 'atm',
    patterns: [/כספומט/i, /atm/i, /משיכת מזומן/i, /cash withdrawal/i],
  },
  // Transfers
  {
    category: 'transfers',
    patterns: [/העברה/i, /transfer/i, /bit/i, /paybox/i, /pepper/i],
  },
];

export function categorize(description: string): Category {
  for (const rule of RULES) {
    if (rule.patterns.some(p => p.test(description))) {
      return CATEGORIES[rule.category];
    }
  }
  return CATEGORIES.other;
}
