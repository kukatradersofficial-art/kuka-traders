import type { Product, Review } from '../types';

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export interface ReviewThemeMatch {
  id: string;
  label: string;
  polarity: SentimentLabel;
}

export interface AnalyzedReview {
  review: Review;
  sentiment: SentimentLabel;
  score: number; // -1 to +1 normalized score
  createdAtMs: number;
  themes: ReviewThemeMatch[];
  needsAttention: boolean;
}

export interface RatingBucket {
  star: 5 | 4 | 3 | 2 | 1;
  label: string;
  count: number;
  percentage: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
}

export interface TrendPoint {
  bucketKey: string;
  label: string;
  positive: number;
  neutral: number;
  negative: number;
  total: number;
  avgRating: number;
}

export interface ThemeStat {
  id: string;
  label: string;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  total: number;
}

export interface ProductFeedbackStat {
  productId: string;
  productName: string;
  categoryName: string;
  reviewCount: number;
  avgRating: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  pendingCount: number;
  unrepliedCount: number;
  sentimentScore: number; // % positive minus % negative
}

const POSITIVE_WORDS = new Set([
  'fresh',
  'pure',
  'authentic',
  'genuine',
  'clean',
  'original',
  'quality',
  'good',
  'great',
  'excellent',
  'best',
  'amazing',
  'awesome',
  'wonderful',
  'superb',
  'nice',
  'love',
  'loved',
  'happy',
  'satisfied',
  'recommend',
  'recommended',
  'fast',
  'quick',
  'timely',
  'prompt',
  'polite',
  'helpful',
  'affordable',
  'reasonable',
  'value',
  'worth',
  'sealed',
  'intact',
  'hygienic',
  'tasty',
  'delicious',
  'aromatic',
  'healthy',
  'trustworthy',
  'reliable',
  'smooth',
  'perfect',
  'mashallah',
  'badiya',
  'shandar',
]);

const NEGATIVE_WORDS = new Set([
  'bad',
  'poor',
  'worst',
  'terrible',
  'horrible',
  'awful',
  'stale',
  'expired',
  'old',
  'rotten',
  'spoiled',
  'damaged',
  'broken',
  'torn',
  'leaking',
  'leaked',
  'dirty',
  'fake',
  'duplicate',
  'adulterated',
  'late',
  'delay',
  'delayed',
  'slow',
  'missing',
  'wrong',
  'expensive',
  'overpriced',
  'costly',
  'rude',
  'unhelpful',
  'disappointed',
  'disappointing',
  'waste',
  'pathetic',
  'unusable',
  'smell',
  'smelly',
  'insects',
  'bugs',
  'less',
  'short',
  'underweight',
  'issue',
  'problem',
  'complaint',
  'refund',
]);

const NEGATION_WORDS = new Set([
  'not',
  'no',
  'never',
  'neither',
  'hardly',
  'barely',
  "wasn't",
  "isn't",
  "aren't",
  "don't",
  "didn't",
  "doesn't",
  "won't",
  "can't",
  "couldn't",
]);

const THEME_DEFINITIONS: Array<{
  id: string;
  label: string;
  keywords: string[];
}> = [
  {
    id: 'quality',
    label: 'Freshness & Quality',
    keywords: [
      'fresh',
      'quality',
      'pure',
      'authentic',
      'original',
      'taste',
      'tasty',
      'aroma',
      'aromatic',
      'stale',
      'expired',
      'rotten',
      'spoiled',
      'adulterated',
      'fake',
      'clean',
      'hygienic',
    ],
  },
  {
    id: 'delivery',
    label: 'Delivery & Timing',
    keywords: [
      'delivery',
      'deliver',
      'delivered',
      'fast',
      'quick',
      'timely',
      'on time',
      'late',
      'delay',
      'delayed',
      'slow',
      'rider',
      'sopore',
      'time',
    ],
  },
  {
    id: 'packaging',
    label: 'Packaging & Seal',
    keywords: [
      'pack',
      'packed',
      'packing',
      'packaging',
      'seal',
      'sealed',
      'damaged',
      'broken',
      'torn',
      'leak',
      'leaking',
      'leaked',
      'intact',
      'box',
      'bag',
    ],
  },
  {
    id: 'pricing',
    label: 'Pricing & Value',
    keywords: [
      'price',
      'pricing',
      'affordable',
      'reasonable',
      'cheap',
      'value',
      'worth',
      'money',
      'mrp',
      'discount',
      'expensive',
      'overpriced',
      'costly',
    ],
  },
  {
    id: 'accuracy',
    label: 'Weight & Order Accuracy',
    keywords: [
      'weight',
      'quantity',
      'kg',
      'gram',
      'grams',
      'missing',
      'wrong',
      'item',
      'short',
      'underweight',
      'exact',
      'complete',
    ],
  },
];

export function toMillis(value: unknown): number {
  if (!value) return 0;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toMillis' in value &&
    typeof (value as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  return 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function analyzeSingleReview(review: Review): AnalyzedReview {
  const tokens = tokenize(review.comment || '');
  let posHits = 0;
  let negHits = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : '';
    const prev2 = i > 1 ? tokens[i - 2] : '';
    const isNegated = NEGATION_WORDS.has(prev) || NEGATION_WORDS.has(prev2);

    if (POSITIVE_WORDS.has(token)) {
      if (isNegated) negHits += 1.2;
      else posHits += 1;
    } else if (NEGATIVE_WORDS.has(token)) {
      if (isNegated) posHits += 0.5;
      else negHits += 1.2;
    }
  }

  const rating = Math.min(5, Math.max(1, Number(review.rating) || 3));
  // Rating contributes primary signal (-1 to +1), lexical sentiment refines/flags mixed feedback
  const ratingSignal = (rating - 3) / 2; // 5 -> +1, 4 -> +0.5, 3 -> 0, 2 -> -0.5, 1 -> -1
  const totalLexHits = posHits + negHits;
  const lexSignal = totalLexHits > 0 ? (posHits - negHits) / Math.max(2, totalLexHits) : 0;

  const combinedScore = Number((ratingSignal * 0.65 + lexSignal * 0.35).toFixed(3));

  let sentiment: SentimentLabel;
  if (rating <= 2) {
    sentiment = 'negative';
  } else if (rating === 3) {
    if (lexSignal >= 0.35) sentiment = 'positive';
    else if (lexSignal <= -0.25) sentiment = 'negative';
    else sentiment = 'neutral';
  } else {
    // 4 or 5 stars
    if (negHits >= 2 && negHits > posHits) sentiment = 'neutral';
    else if (rating === 4 && negHits >= 1 && posHits === 0) sentiment = 'neutral';
    else sentiment = 'positive';
  }

  const lowerComment = (review.comment || '').toLowerCase();
  const themes: ReviewThemeMatch[] = [];
  for (const def of THEME_DEFINITIONS) {
    const matched = def.keywords.some((kw) => lowerComment.includes(kw));
    if (matched) {
      themes.push({
        id: def.id,
        label: def.label,
        polarity: sentiment,
      });
    }
  }

  const needsAttention =
    sentiment === 'negative' ||
    (sentiment === 'neutral' && negHits > 0) ||
    review.status === 'pending';

  return {
    review,
    sentiment,
    score: combinedScore,
    createdAtMs: toMillis(review.createdAt) || toMillis(review.updatedAt),
    themes,
    needsAttention,
  };
}

export function buildRatingDistribution(analyzed: AnalyzedReview[]): RatingBucket[] {
  const total = analyzed.length;
  const stars: Array<5 | 4 | 3 | 2 | 1> = [5, 4, 3, 2, 1];
  return stars.map((star) => {
    const matching = analyzed.filter((item) => Math.round(item.review.rating) === star);
    const count = matching.length;
    return {
      star,
      label: `${star} Star`,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      positiveCount: matching.filter((m) => m.sentiment === 'positive').length,
      neutralCount: matching.filter((m) => m.sentiment === 'neutral').length,
      negativeCount: matching.filter((m) => m.sentiment === 'negative').length,
    };
  });
}

export function buildSentimentTrend(analyzed: AnalyzedReview[]): TrendPoint[] {
  const dated = analyzed
    .filter((item) => item.createdAtMs > 0)
    .sort((a, b) => a.createdAtMs - b.createdAtMs);

  if (dated.length === 0) return [];

  const minMs = dated[0].createdAtMs;
  const maxMs = dated[dated.length - 1].createdAtMs;
  const spanDays = (maxMs - minMs) / (1000 * 60 * 60 * 24);
  const useMonthBuckets = spanDays > 60;

  const bucketMap = new Map<
    string,
    { label: string; positive: number; neutral: number; negative: number; ratingSum: number }
  >();

  const istDateFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
  });
  const istMonthFormatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    year: '2-digit',
  });
  const istKeyFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  for (const item of dated) {
    const d = new Date(item.createdAtMs);
    const fullDayKey = istKeyFormatter.format(d); // YYYY-MM-DD
    const key = useMonthBuckets ? fullDayKey.slice(0, 7) : fullDayKey;
    const label = useMonthBuckets ? istMonthFormatter.format(d) : istDateFormatter.format(d);

    const curr = bucketMap.get(key) ?? {
      label,
      positive: 0,
      neutral: 0,
      negative: 0,
      ratingSum: 0,
    };
    curr[item.sentiment] += 1;
    curr.ratingSum += Number(item.review.rating) || 0;
    bucketMap.set(key, curr);
  }

  return Array.from(bucketMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucketKey, data]) => {
      const total = data.positive + data.neutral + data.negative;
      return {
        bucketKey,
        label: data.label,
        positive: data.positive,
        neutral: data.neutral,
        negative: data.negative,
        total,
        avgRating: total > 0 ? Number((data.ratingSum / total).toFixed(2)) : 0,
      };
    });
}

export function buildThemeStats(analyzed: AnalyzedReview[]): ThemeStat[] {
  const map = new Map<string, ThemeStat>();
  for (const def of THEME_DEFINITIONS) {
    map.set(def.id, {
      id: def.id,
      label: def.label,
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      total: 0,
    });
  }

  for (const item of analyzed) {
    for (const theme of item.themes) {
      const entry = map.get(theme.id);
      if (!entry) continue;
      entry.total += 1;
      if (item.sentiment === 'positive') entry.positiveCount += 1;
      else if (item.sentiment === 'neutral') entry.neutralCount += 1;
      else entry.negativeCount += 1;
    }
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export function buildProductFeedbackStats(
  analyzed: AnalyzedReview[],
  products: Product[]
): ProductFeedbackStat[] {
  const productLookup = new Map<string, Product>();
  for (const p of products) {
    productLookup.set(p.id, p);
  }

  const byProduct = new Map<
    string,
    {
      productName: string;
      categoryName: string;
      ratingSum: number;
      positiveCount: number;
      neutralCount: number;
      negativeCount: number;
      pendingCount: number;
      unrepliedCount: number;
    }
  >();

  for (const item of analyzed) {
    const r = item.review;
    const prod = productLookup.get(r.productId);
    const curr = byProduct.get(r.productId) ?? {
      productName: prod?.name || r.productName || 'Unknown Product',
      categoryName: prod?.categoryName || 'General',
      ratingSum: 0,
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      pendingCount: 0,
      unrepliedCount: 0,
    };

    curr.ratingSum += Number(r.rating) || 0;
    if (item.sentiment === 'positive') curr.positiveCount += 1;
    else if (item.sentiment === 'neutral') curr.neutralCount += 1;
    else curr.negativeCount += 1;
    if (r.status === 'pending') curr.pendingCount += 1;
    if (!r.adminReply || !r.adminReply.trim()) curr.unrepliedCount += 1;

    byProduct.set(r.productId, curr);
  }

  return Array.from(byProduct.entries())
    .map(([productId, data]) => {
      const reviewCount = data.positiveCount + data.neutralCount + data.negativeCount;
      const avgRating = reviewCount > 0 ? Number((data.ratingSum / reviewCount).toFixed(2)) : 0;
      const sentimentScore =
        reviewCount > 0
          ? Math.round(((data.positiveCount - data.negativeCount) / reviewCount) * 100)
          : 0;
      return {
        productId,
        productName: data.productName,
        categoryName: data.categoryName,
        reviewCount,
        avgRating,
        positiveCount: data.positiveCount,
        neutralCount: data.neutralCount,
        negativeCount: data.negativeCount,
        pendingCount: data.pendingCount,
        unrepliedCount: data.unrepliedCount,
        sentimentScore,
      };
    })
    .sort((a, b) => b.reviewCount - a.reviewCount || b.avgRating - a.avgRating);
}

export function exportReviewsCsv(analyzed: AnalyzedReview[]): string {
  const escape = (val: unknown) => {
    const s = String(val ?? '');
    if (/[",\n\r]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headers = [
    'Review ID',
    'Product Name',
    'Customer Name',
    'Rating',
    'Sentiment',
    'Sentiment Score',
    'Themes',
    'Verified Purchase',
    'Moderation Status',
    'Comment',
    'Admin Reply',
    'Submitted Date (IST)',
  ];

  const rows = analyzed.map((item) => {
    const r = item.review;
    const dateStr = item.createdAtMs
      ? new Intl.DateTimeFormat('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(item.createdAtMs))
      : '';
    return [
      r.id,
      r.productName,
      r.userName,
      r.rating,
      item.sentiment,
      item.score,
      item.themes.map((t) => t.label).join('; '),
      r.verifiedPurchase ? 'Yes' : 'No',
      r.status,
      r.comment,
      r.adminReply || '',
      dateStr,
    ]
      .map(escape)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
