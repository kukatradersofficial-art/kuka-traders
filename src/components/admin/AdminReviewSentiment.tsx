import React, { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  EyeOff,
  Filter,
  MessageSquare,
  Minus,
  RotateCcw,
  Search,
  Star,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import type { Product, Review } from '../../types';
import { deleteReview, moderateReview } from '../../services/firestoreStore';
import { formatISTDateTime } from '../../utils/format';
import {
  analyzeSingleReview,
  buildProductFeedbackStats,
  buildRatingDistribution,
  buildSentimentTrend,
  buildThemeStats,
  exportReviewsCsv,
  type AnalyzedReview,
  type SentimentLabel,
} from '../../utils/reviewSentiment';

interface AdminReviewSentimentProps {
  reviews: Review[];
  products: Product[];
}

type TimeRangeFilter = 'all' | '30d' | '7d';
type ModerationFilter = 'all' | 'pending' | 'approved' | 'hidden';
type SortMode = 'newest' | 'lowest_rating' | 'attention';

const SENTIMENT_COLORS: Record<SentimentLabel, string> = {
  positive: '#16A34A',
  neutral: '#D97706',
  negative: '#DC2626',
};

const SENTIMENT_LABELS: Record<SentimentLabel, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
};

export const AdminReviewSentiment: React.FC<AdminReviewSentimentProps> = ({
  reviews,
  products,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState<TimeRangeFilter>('all');
  const [moderationFilter, setModerationFilter] = useState<ModerationFilter>('all');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [selectedStar, setSelectedStar] = useState<number | null>(null);
  const [selectedSentiment, setSelectedSentiment] = useState<SentimentLabel | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('newest');

  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState('');

  // Analyze all reviews deterministically once per reviews update
  const allAnalyzed = useMemo(() => reviews.map(analyzeSingleReview), [reviews]);

  // Top-level scoped dataset (Time Range + Moderation Status + Verified Toggle + Search)
  // Charts reflect this scoped slice so store owners can inspect e.g. "Last 30 Days" or "Verified Buyers"
  const scopedAnalyzed = useMemo(() => {
    const now = Date.now();
    const cutoffMs =
      timeRange === '7d'
        ? now - 7 * 24 * 60 * 60 * 1000
        : timeRange === '30d'
          ? now - 30 * 24 * 60 * 60 * 1000
          : 0;
    const q = searchQuery.trim().toLowerCase();

    return allAnalyzed.filter((item) => {
      const r = item.review;
      if (cutoffMs > 0 && item.createdAtMs > 0 && item.createdAtMs < cutoffMs) {
        return false;
      }
      if (moderationFilter !== 'all' && r.status !== moderationFilter) {
        return false;
      }
      if (verifiedOnly && !r.verifiedPurchase) {
        return false;
      }
      if (q) {
        const hay = `${r.productName} ${r.userName} ${r.comment} ${r.adminReply}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allAnalyzed, timeRange, moderationFilter, verifiedOnly, searchQuery]);

  // Cross-filtered list for the review moderation feed below charts
  const filteredFeed = useMemo(() => {
    const list = scopedAnalyzed.filter((item) => {
      if (selectedStar !== null && Math.round(item.review.rating) !== selectedStar) {
        return false;
      }
      if (selectedSentiment !== null && item.sentiment !== selectedSentiment) {
        return false;
      }
      if (
        selectedThemeId !== null &&
        !item.themes.some((t) => t.id === selectedThemeId)
      ) {
        return false;
      }
      if (selectedProductId !== null && item.review.productId !== selectedProductId) {
        return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortMode === 'lowest_rating') {
        return a.review.rating - b.review.rating || b.createdAtMs - a.createdAtMs;
      }
      if (sortMode === 'attention') {
        return (
          Number(b.needsAttention) - Number(a.needsAttention) ||
          a.score - b.score ||
          b.createdAtMs - a.createdAtMs
        );
      }
      return b.createdAtMs - a.createdAtMs;
    });
  }, [
    scopedAnalyzed,
    selectedStar,
    selectedSentiment,
    selectedThemeId,
    selectedProductId,
    sortMode,
  ]);

  // Aggregated Metrics
  const metrics = useMemo(() => {
    const total = scopedAnalyzed.length;
    if (total === 0) {
      return {
        total: 0,
        avgRating: 0,
        verifiedPct: 0,
        positiveCount: 0,
        neutralCount: 0,
        negativeCount: 0,
        positivePct: 0,
        neutralPct: 0,
        negativePct: 0,
        netSentiment: 0,
        pendingCount: 0,
        repliedPct: 0,
        unrepliedNegativeCount: 0,
      };
    }

    let ratingSum = 0;
    let verifiedCount = 0;
    let positiveCount = 0;
    let neutralCount = 0;
    let negativeCount = 0;
    let pendingCount = 0;
    let repliedCount = 0;
    let unrepliedNegativeCount = 0;

    for (const item of scopedAnalyzed) {
      const r = item.review;
      ratingSum += Number(r.rating) || 0;
      if (r.verifiedPurchase) verifiedCount += 1;
      if (item.sentiment === 'positive') positiveCount += 1;
      else if (item.sentiment === 'neutral') neutralCount += 1;
      else negativeCount += 1;
      if (r.status === 'pending') pendingCount += 1;
      if (r.adminReply && r.adminReply.trim().length > 0) repliedCount += 1;
      else if (item.sentiment === 'negative') unrepliedNegativeCount += 1;
    }

    const positivePct = Math.round((positiveCount / total) * 1000) / 10;
    const neutralPct = Math.round((neutralCount / total) * 1000) / 10;
    const negativePct = Math.round((negativeCount / total) * 1000) / 10;

    return {
      total,
      avgRating: Number((ratingSum / total).toFixed(2)),
      verifiedPct: Math.round((verifiedCount / total) * 100),
      positiveCount,
      neutralCount,
      negativeCount,
      positivePct,
      neutralPct,
      negativePct,
      netSentiment: Math.round(((positiveCount - negativeCount) / total) * 100),
      pendingCount,
      repliedPct: Math.round((repliedCount / total) * 100),
      unrepliedNegativeCount,
    };
  }, [scopedAnalyzed]);

  const ratingDistribution = useMemo(
    () => buildRatingDistribution(scopedAnalyzed),
    [scopedAnalyzed]
  );

  const trendData = useMemo(
    () => buildSentimentTrend(scopedAnalyzed),
    [scopedAnalyzed]
  );

  const themeStats = useMemo(() => buildThemeStats(scopedAnalyzed), [scopedAnalyzed]);

  const productStats = useMemo(
    () => buildProductFeedbackStats(scopedAnalyzed, products),
    [scopedAnalyzed, products]
  );

  const donutData = useMemo(
    () => [
      { name: 'Positive', key: 'positive' as SentimentLabel, value: metrics.positiveCount, color: SENTIMENT_COLORS.positive },
      { name: 'Neutral', key: 'neutral' as SentimentLabel, value: metrics.neutralCount, color: SENTIMENT_COLORS.neutral },
      { name: 'Negative', key: 'negative' as SentimentLabel, value: metrics.negativeCount, color: SENTIMENT_COLORS.negative },
    ],
    [metrics]
  );

  const hasChartFilters =
    selectedStar !== null ||
    selectedSentiment !== null ||
    selectedThemeId !== null ||
    selectedProductId !== null;

  const hasAnyFilter =
    hasChartFilters ||
    timeRange !== 'all' ||
    moderationFilter !== 'all' ||
    verifiedOnly ||
    searchQuery.trim().length > 0;

  const resetAllFilters = () => {
    setSearchQuery('');
    setTimeRange('all');
    setModerationFilter('all');
    setVerifiedOnly(false);
    setSelectedStar(null);
    setSelectedSentiment(null);
    setSelectedThemeId(null);
    setSelectedProductId(null);
  };

  const handleExportCsv = () => {
    const csv = exportReviewsCsv(filteredFeed);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `kuka_traders_reviews_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setActionFeedback(`Exported ${filteredFeed.length} review records to CSV.`);
  };

  const handleModerate = async (
    review: Review,
    status: Review['status'],
    replyText: string,
    successNote: string
  ) => {
    setSavingId(review.id);
    try {
      await moderateReview(review.id, {
        status,
        adminReply: replyText,
      });
      setActionFeedback(successNote);
    } catch (err) {
      setActionFeedback(
        err instanceof Error ? err.message : 'Unable to update review in Firestore.'
      );
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (review: Review) => {
    setSavingId(review.id);
    try {
      await deleteReview(review.id);
      setActionFeedback(`Deleted review from ${review.userName} on ${review.productName}.`);
    } catch (err) {
      setActionFeedback(
        err instanceof Error ? err.message : 'Unable to delete review in Firestore.'
      );
    } finally {
      setSavingId(null);
    }
  };

  const renderSentimentText = (sentiment: SentimentLabel) => {
    if (sentiment === 'positive') {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
          <ThumbsUp className="w-3.5 h-3.5 shrink-0" />
          Positive
        </span>
      );
    }
    if (sentiment === 'neutral') {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
          <Minus className="w-3.5 h-3.5 shrink-0" />
          Neutral
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-red-700">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        Negative
      </span>
    );
  };

  const selectedProductName = selectedProductId
    ? productStats.find((p) => p.productId === selectedProductId)?.productName || selectedProductId
    : null;

  const selectedThemeName = selectedThemeId
    ? themeStats.find((t) => t.id === selectedThemeId)?.label || selectedThemeId
    : null;

  return (
    <div className="space-y-6">
      {/* Top Toolbar: Search, Time Range, Status Filter, Verified Toggle, CSV Export */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reviews by product, customer, or keyword..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-stone-300 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#F36B16]/30 focus:border-[#F36B16]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Time Range Segmented Control */}
            <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg text-xs font-semibold">
              {(
                [
                  { id: 'all', label: 'All Time' },
                  { id: '30d', label: '30 Days' },
                  { id: '7d', label: '7 Days' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTimeRange(opt.id)}
                  className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                    timeRange === opt.id
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setVerifiedOnly((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                verifiedOnly
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
              }`}
            >
              Verified Buyers Only
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredFeed.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-300 bg-white text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100">
          <div className="flex flex-wrap items-center gap-1 p-1 bg-stone-100 rounded-lg text-xs font-semibold">
            {(
              [
                { id: 'all', label: `All Statuses (${allAnalyzed.length})` },
                {
                  id: 'pending',
                  label: `Pending (${allAnalyzed.filter((a) => a.review.status === 'pending').length})`,
                },
                {
                  id: 'approved',
                  label: `Approved (${allAnalyzed.filter((a) => a.review.status === 'approved').length})`,
                },
                {
                  id: 'hidden',
                  label: `Hidden (${allAnalyzed.filter((a) => a.review.status === 'hidden').length})`,
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setModerationFilter(opt.id)}
                className={`px-2.5 py-1 rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  moderationFilter === opt.id
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {hasAnyFilter && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F36B16] hover:underline whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset All Filters
            </button>
          )}
        </div>
      </div>

      {actionFeedback && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-stone-800 flex items-center justify-between gap-3">
          <span>{actionFeedback}</span>
          <button
            type="button"
            onClick={() => setActionFeedback('')}
            className="font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <p className="text-xs font-medium text-stone-500">Average Rating</p>
          <div className="flex items-baseline gap-2 mt-1">
            <p className="font-mono text-2xl font-bold text-stone-900 tabular-nums">
              {metrics.total > 0 ? metrics.avgRating.toFixed(2) : '—'}
            </p>
            <span className="text-xs font-mono text-stone-400 tabular-nums">/ 5.0</span>
          </div>
          <p className="text-xs text-stone-500 mt-1 tabular-nums">
            {metrics.total} reviews · {metrics.verifiedPct}% verified purchases
          </p>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <p className="text-xs font-medium text-stone-500">Positive Sentiment Share</p>
          <p className="font-mono text-2xl font-bold text-emerald-700 mt-1 tabular-nums">
            {metrics.total > 0 ? `${metrics.positivePct}%` : '—'}
          </p>
          <p className="text-xs text-stone-500 mt-1 tabular-nums">
            {metrics.positiveCount} pos · {metrics.neutralCount} neu · {metrics.negativeCount} neg
          </p>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <p className="text-xs font-medium text-stone-500">Net Sentiment Score</p>
          <p
            className={`font-mono text-2xl font-bold mt-1 tabular-nums ${
              metrics.netSentiment > 0
                ? 'text-emerald-700'
                : metrics.netSentiment < 0
                  ? 'text-red-700'
                  : 'text-stone-900'
            }`}
          >
            {metrics.total > 0
              ? `${metrics.netSentiment > 0 ? '+' : ''}${metrics.netSentiment}`
              : '—'}
          </p>
          <p className="text-xs text-stone-500 mt-1">
            Positive share minus negative share (-100 to +100)
          </p>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <p className="text-xs font-medium text-stone-500">Store Response &amp; Queue</p>
          <p className="font-mono text-2xl font-bold text-stone-900 mt-1 tabular-nums">
            {metrics.total > 0 ? `${metrics.repliedPct}% replied` : '—'}
          </p>
          <p className="text-xs text-stone-500 mt-1 tabular-nums">
            {metrics.pendingCount} pending moderation ·{' '}
            <span className={metrics.unrepliedNegativeCount > 0 ? 'text-red-700 font-semibold' : ''}>
              {metrics.unrepliedNegativeCount} negative unreplied
            </span>
          </p>
        </div>
      </div>

      {/* Empty State Banner when no reviews exist in Firestore */}
      {reviews.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-10 text-center space-y-2">
          <MessageSquare className="w-8 h-8 text-stone-400 mx-auto" />
          <h3 className="font-display text-base font-bold text-stone-900">
            No Customer Reviews Recorded Yet
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
            Once shoppers submit ratings and product reviews in the KUKA TRADERS storefront, star
            distributions, sentiment trends over time, theme breakdowns, and product feedback
            rankings will populate automatically in real time.
          </p>
        </div>
      ) : (
        <>
          {/* Row 1: Ratings Distribution (7 cols) + Sentiment Breakdown Donut (5 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Star Rating Distribution with Sentiment Split Inside Each Bar */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-stone-200 p-5 flex flex-col justify-between gap-5">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="font-display font-bold text-stone-900 text-base">
                      Ratings Distribution (5★ to 1★)
                    </h3>
                    <p className="text-xs text-stone-500">
                      Click any star row to filter customer reviews below
                    </p>
                  </div>
                  {selectedStar !== null && (
                    <button
                      type="button"
                      onClick={() => setSelectedStar(null)}
                      className="text-xs font-semibold text-[#F36B16] hover:underline whitespace-nowrap shrink-0"
                    >
                      Clear {selectedStar}★ Filter
                    </button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {ratingDistribution.map((bucket) => {
                    const isSelected = selectedStar === bucket.star;
                    const posW =
                      bucket.count > 0 ? (bucket.positiveCount / bucket.count) * bucket.percentage : 0;
                    const neuW =
                      bucket.count > 0 ? (bucket.neutralCount / bucket.count) * bucket.percentage : 0;
                    const negW =
                      bucket.count > 0 ? (bucket.negativeCount / bucket.count) * bucket.percentage : 0;

                    return (
                      <button
                        key={bucket.star}
                        type="button"
                        onClick={() =>
                          setSelectedStar((prev) => (prev === bucket.star ? null : bucket.star))
                        }
                        className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-colors ${
                          isSelected
                            ? 'border-[#F36B16] bg-orange-50/60'
                            : 'border-transparent hover:bg-stone-50'
                        }`}
                      >
                        <div className="w-16 flex items-center gap-1 text-xs font-semibold text-stone-800 shrink-0 tabular-nums">
                          <span>{bucket.star}</span>
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        </div>

                        <div className="flex-1 h-3.5 bg-stone-100 rounded-full overflow-hidden flex">
                          {posW > 0 && (
                            <div
                              style={{ width: `${posW}%`, backgroundColor: SENTIMENT_COLORS.positive }}
                              title={`${bucket.positiveCount} Positive`}
                            />
                          )}
                          {neuW > 0 && (
                            <div
                              style={{ width: `${neuW}%`, backgroundColor: SENTIMENT_COLORS.neutral }}
                              title={`${bucket.neutralCount} Neutral`}
                            />
                          )}
                          {negW > 0 && (
                            <div
                              style={{ width: `${negW}%`, backgroundColor: SENTIMENT_COLORS.negative }}
                              title={`${bucket.negativeCount} Negative`}
                            />
                          )}
                        </div>

                        <div className="w-24 text-right font-mono text-xs text-stone-700 shrink-0 tabular-nums">
                          {bucket.count}{' '}
                          <span className="text-stone-400">({bucket.percentage.toFixed(0)}%)</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Overall Proportional Sentiment Strip */}
              <div className="pt-4 border-t border-stone-100 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-700">Overall Sentiment Proportion</span>
                  <span className="font-mono text-stone-500 tabular-nums">
                    {metrics.total} analyzed
                  </span>
                </div>
                <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden flex">
                  {metrics.positivePct > 0 && (
                    <div
                      style={{
                        width: `${metrics.positivePct}%`,
                        backgroundColor: SENTIMENT_COLORS.positive,
                      }}
                    />
                  )}
                  {metrics.neutralPct > 0 && (
                    <div
                      style={{
                        width: `${metrics.neutralPct}%`,
                        backgroundColor: SENTIMENT_COLORS.neutral,
                      }}
                    />
                  )}
                  {metrics.negativePct > 0 && (
                    <div
                      style={{
                        width: `${metrics.negativePct}%`,
                        backgroundColor: SENTIMENT_COLORS.negative,
                      }}
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600 pt-1">
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <ThumbsUp className="w-3.5 h-3.5 text-emerald-600" />
                    Positive: <strong className="text-stone-900">{metrics.positiveCount}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Minus className="w-3.5 h-3.5 text-amber-600" />
                    Neutral: <strong className="text-stone-900">{metrics.neutralCount}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    Negative: <strong className="text-stone-900">{metrics.negativeCount}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Sentiment Breakdown Donut */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-stone-200 p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <h3 className="font-display font-bold text-stone-900 text-base">
                    Review Sentiment Breakdown
                  </h3>
                  <p className="text-xs text-stone-500">
                    Combines star rating &amp; comment tone
                  </p>
                </div>
                {selectedSentiment !== null && (
                  <button
                    type="button"
                    onClick={() => setSelectedSentiment(null)}
                    className="text-xs font-semibold text-[#F36B16] hover:underline whitespace-nowrap shrink-0"
                  >
                    Clear
                  </button>
                )}
              </div>

              {metrics.total === 0 ? (
                <div className="h-52 flex items-center justify-center text-xs text-stone-500">
                  No reviews match current scope filters.
                </div>
              ) : (
                <div className="relative h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie
                        data={donutData.filter((d) => d.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={82}
                        paddingAngle={3}
                        onClick={(entry) => {
                          const key = (entry as { key?: SentimentLabel })?.key;
                          if (key) {
                            setSelectedSentiment((prev) => (prev === key ? null : key));
                          }
                        }}
                      >
                        {donutData
                          .filter((d) => d.value > 0)
                          .map((entry) => (
                            <Cell
                              key={entry.key}
                              fill={entry.color}
                              opacity={
                                selectedSentiment === null || selectedSentiment === entry.key
                                  ? 1
                                  : 0.35
                              }
                              className="cursor-pointer outline-none"
                            />
                          ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [`${value} reviews`, 'Count']}
                        contentStyle={{
                          fontSize: '12px',
                          borderRadius: '8px',
                          border: '1px solid #E7E5E4',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono text-xl font-bold text-stone-900 tabular-nums">
                      {metrics.total}
                    </span>
                    <span className="text-[11px] text-stone-500">Reviews</span>
                  </div>
                </div>
              )}

              <div className="divide-y divide-stone-100 text-xs pt-2">
                {donutData.map((d) => {
                  const pct =
                    metrics.total > 0 ? Math.round((d.value / metrics.total) * 1000) / 10 : 0;
                  const active = selectedSentiment === d.key;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() =>
                        setSelectedSentiment((prev) => (prev === d.key ? null : d.key))
                      }
                      className={`w-full py-2 px-2 flex items-center justify-between rounded-md transition-colors ${
                        active ? 'bg-stone-100 font-semibold' : 'hover:bg-stone-50'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-stone-800">
                        {renderSentimentText(d.key)}
                      </span>
                      <span className="font-mono text-stone-700 tabular-nums">
                        {d.value} <span className="text-stone-400">({pct.toFixed(1)}%)</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Row 2: Chronological Sentiment & Rating Trend (7 cols) + Feedback Themes (5 cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white rounded-xl border border-stone-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h3 className="font-display font-bold text-stone-900 text-base">
                    Sentiment &amp; Rating Trend Over Time
                  </h3>
                  <p className="text-xs text-stone-500">
                    Stacked feedback volume (bars) with average rating trajectory (line)
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-stone-600">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#16A34A]" /> Positive
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#D97706]" /> Neutral
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#DC2626]" /> Negative
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-[#0F172A]" /> Avg Rating
                  </span>
                </div>
              </div>

              {trendData.length === 0 ? (
                <div className="h-64 flex items-center justify-center text-xs text-stone-500 border border-dashed border-stone-200 rounded-lg">
                  No dated reviews available for the selected filter window.
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <ComposedChart
                      data={trendData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#57534E' }} />
                      <YAxis
                        yAxisId="left"
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#57534E' }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        domain={[0, 5]}
                        ticks={[1, 2, 3, 4, 5]}
                        tick={{ fontSize: 11, fill: '#0F172A' }}
                      />
                      <Tooltip
                        contentStyle={{
                          fontSize: '12px',
                          borderRadius: '8px',
                          border: '1px solid #E7E5E4',
                        }}
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="positive"
                        stackId="sent"
                        fill={SENTIMENT_COLORS.positive}
                        name="Positive"
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="neutral"
                        stackId="sent"
                        fill={SENTIMENT_COLORS.neutral}
                        name="Neutral"
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="negative"
                        stackId="sent"
                        fill={SENTIMENT_COLORS.negative}
                        name="Negative"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="avgRating"
                        stroke="#0F172A"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#0F172A' }}
                        name="Avg Rating"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Feedback Theme Breakdown */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-stone-200 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div>
                    <h3 className="font-display font-bold text-stone-900 text-base">
                      Feedback Topics Mentioned
                    </h3>
                    <p className="text-xs text-stone-500">
                      Click a topic to filter matching customer comments
                    </p>
                  </div>
                  {selectedThemeId !== null && (
                    <button
                      type="button"
                      onClick={() => setSelectedThemeId(null)}
                      className="text-xs font-semibold text-[#F36B16] hover:underline whitespace-nowrap shrink-0"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {themeStats.map((theme) => {
                    const isSelected = selectedThemeId === theme.id;
                    const posW =
                      theme.total > 0 ? (theme.positiveCount / theme.total) * 100 : 0;
                    const neuW =
                      theme.total > 0 ? (theme.neutralCount / theme.total) * 100 : 0;
                    const negW =
                      theme.total > 0 ? (theme.negativeCount / theme.total) * 100 : 0;

                    return (
                      <button
                        key={theme.id}
                        type="button"
                        disabled={theme.total === 0}
                        onClick={() =>
                          setSelectedThemeId((prev) => (prev === theme.id ? null : theme.id))
                        }
                        className={`w-full text-left p-2.5 rounded-lg border transition-colors disabled:opacity-50 ${
                          isSelected
                            ? 'border-[#F36B16] bg-orange-50/60'
                            : 'border-stone-200 hover:bg-stone-50'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold text-stone-900">{theme.label}</span>
                          <span className="font-mono text-stone-600 tabular-nums">
                            {theme.total} mentions
                          </span>
                        </div>
                        <div className="h-2 w-full bg-stone-100 rounded-full overflow-hidden flex">
                          {posW > 0 && (
                            <div
                              style={{ width: `${posW}%`, backgroundColor: SENTIMENT_COLORS.positive }}
                            />
                          )}
                          {neuW > 0 && (
                            <div
                              style={{ width: `${neuW}%`, backgroundColor: SENTIMENT_COLORS.neutral }}
                            />
                          )}
                          {negW > 0 && (
                            <div
                              style={{ width: `${negW}%`, backgroundColor: SENTIMENT_COLORS.negative }}
                            />
                          )}
                        </div>
                        <p className="text-[11px] text-stone-500 mt-1 font-mono tabular-nums">
                          +{theme.positiveCount} pos · {theme.neutralCount} neu · -{theme.negativeCount} neg
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Product Rating & Sentiment Leaderboard */}
          {productStats.length > 0 && (
            <div className="bg-white rounded-xl border border-stone-200 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h3 className="font-display font-bold text-stone-900 text-base">
                    Product Rating &amp; Sentiment Breakdown
                  </h3>
                  <p className="text-xs text-stone-500">
                    Identify highest-rated staples and items needing quality or delivery follow-up
                  </p>
                </div>
                {selectedProductId !== null && (
                  <button
                    type="button"
                    onClick={() => setSelectedProductId(null)}
                    className="text-xs font-semibold text-[#F36B16] hover:underline whitespace-nowrap shrink-0"
                  >
                    Show All Products
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="py-2.5 pr-4 font-semibold">Product</th>
                      <th className="py-2.5 pr-4 font-semibold">Category</th>
                      <th className="py-2.5 pr-4 text-right font-semibold">Reviews</th>
                      <th className="py-2.5 pr-4 text-right font-semibold">Avg Rating</th>
                      <th className="py-2.5 pr-4 font-semibold">Sentiment Mix</th>
                      <th className="py-2.5 pr-4 text-right font-semibold">Net Score</th>
                      <th className="py-2.5 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {productStats.slice(0, 12).map((p) => {
                      const active = selectedProductId === p.productId;
                      return (
                        <tr
                          key={p.productId}
                          className={active ? 'bg-orange-50/60' : 'hover:bg-stone-50'}
                        >
                          <td className="py-2.5 pr-4 font-semibold text-stone-900 max-w-[240px] truncate">
                            {p.productName}
                          </td>
                          <td className="py-2.5 pr-4 text-stone-500 whitespace-nowrap">
                            {p.categoryName}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-mono text-stone-800 tabular-nums">
                            {p.reviewCount}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-mono font-semibold text-stone-900 tabular-nums">
                            {p.avgRating.toFixed(2)} ★
                          </td>
                          <td className="py-2.5 pr-4 min-w-[140px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden flex">
                                {p.positiveCount > 0 && (
                                  <div
                                    style={{
                                      width: `${(p.positiveCount / p.reviewCount) * 100}%`,
                                      backgroundColor: SENTIMENT_COLORS.positive,
                                    }}
                                  />
                                )}
                                {p.neutralCount > 0 && (
                                  <div
                                    style={{
                                      width: `${(p.neutralCount / p.reviewCount) * 100}%`,
                                      backgroundColor: SENTIMENT_COLORS.neutral,
                                    }}
                                  />
                                )}
                                {p.negativeCount > 0 && (
                                  <div
                                    style={{
                                      width: `${(p.negativeCount / p.reviewCount) * 100}%`,
                                      backgroundColor: SENTIMENT_COLORS.negative,
                                    }}
                                  />
                                )}
                              </div>
                              <span className="font-mono text-[11px] text-stone-500 tabular-nums">
                                {p.positiveCount}/{p.neutralCount}/{p.negativeCount}
                              </span>
                            </div>
                          </td>
                          <td
                            className={`py-2.5 pr-4 text-right font-mono font-semibold tabular-nums ${
                              p.sentimentScore > 0
                                ? 'text-emerald-700'
                                : p.sentimentScore < 0
                                  ? 'text-red-700'
                                  : 'text-stone-700'
                            }`}
                          >
                            {p.sentimentScore > 0 ? '+' : ''}
                            {p.sentimentScore}
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedProductId((prev) =>
                                  prev === p.productId ? null : p.productId
                                )
                              }
                              className={`px-2.5 py-1 rounded-md border font-semibold whitespace-nowrap shrink-0 ${
                                active
                                  ? 'bg-[#F36B16] text-white border-[#F36B16]'
                                  : 'border-stone-300 text-stone-700 hover:bg-stone-100'
                              }`}
                            >
                              {active ? 'Filtered' : 'Filter'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Row 4: Cross-Filtered Review Feed & Moderation Queue */}
          <div className="bg-white rounded-xl border border-stone-200 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-100">
              <div>
                <h3 className="font-display font-bold text-stone-900 text-base">
                  Customer Reviews &amp; Moderation Queue ({filteredFeed.length})
                </h3>
                {(selectedStar !== null ||
                  selectedSentiment !== null ||
                  selectedThemeName !== null ||
                  selectedProductName !== null) && (
                  <p className="text-xs text-stone-600 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-[#F36B16]" />
                    <span>
                      Active filters:
                      {selectedStar !== null ? ` ${selectedStar}★` : ''}
                      {selectedSentiment !== null
                        ? ` · ${SENTIMENT_LABELS[selectedSentiment]} sentiment`
                        : ''}
                      {selectedThemeName ? ` · Topic: ${selectedThemeName}` : ''}
                      {selectedProductName ? ` · Product: ${selectedProductName}` : ''}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-stone-500">Sort:</span>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-white font-semibold text-stone-800"
                >
                  <option value="newest">Newest First</option>
                  <option value="attention">Needs Attention First</option>
                  <option value="lowest_rating">Lowest Rating First</option>
                </select>
              </div>
            </div>

            {filteredFeed.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <p className="text-xs text-stone-500">
                  No customer reviews match the active filters.
                </p>
                {hasAnyFilter && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="px-3.5 py-1.5 rounded-lg border border-stone-300 text-xs font-semibold text-stone-800 hover:bg-stone-50"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {filteredFeed.map((item) => {
                  const r = item.review;
                  const draft = replyDrafts[r.id] ?? r.adminReply;
                  const busy = savingId === r.id;

                  return (
                    <div key={r.id} className="py-4 first:pt-1 last:pb-1 space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-stone-900 text-sm">
                              {r.productName}
                            </span>
                            <span aria-hidden="true" className="text-stone-300">
                              ·
                            </span>
                            <span className="font-mono font-semibold text-stone-800 tabular-nums">
                              {r.rating}/5 ★
                            </span>
                            <span aria-hidden="true" className="text-stone-300">
                              ·
                            </span>
                            {renderSentimentText(item.sentiment)}
                          </div>

                          <p className="text-stone-500">
                            By <span className="font-medium text-stone-700">{r.userName}</span>
                            {r.verifiedPurchase ? ' · Verified Purchase' : ' · Unverified'}
                            {' · '}
                            <span
                              className={
                                r.status === 'approved'
                                  ? 'text-emerald-700 font-semibold'
                                  : r.status === 'pending'
                                    ? 'text-amber-700 font-semibold'
                                    : 'text-stone-500 font-semibold'
                              }
                            >
                              Status: {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                            </span>
                            {' · '}
                            <span>{formatISTDateTime(r.createdAt)}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              handleModerate(
                                r,
                                'approved',
                                draft,
                                `Approved review by ${r.userName}.`
                              )
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap shrink-0 disabled:opacity-50 ${
                              r.status === 'approved'
                                ? 'bg-emerald-700 text-white'
                                : 'bg-emerald-600 text-white hover:bg-emerald-700'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              handleModerate(
                                r,
                                'hidden',
                                draft,
                                `Hidden review by ${r.userName}.`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-700 font-semibold hover:bg-stone-50 whitespace-nowrap shrink-0 disabled:opacity-50"
                          >
                            <EyeOff className="w-3.5 h-3.5" />
                            Hide
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleDelete(r)}
                            aria-label={`Delete review by ${r.userName}`}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-stone-800 leading-relaxed">{r.comment}</p>

                      {item.themes.length > 0 && (
                        <p className="text-[11px] text-stone-500">
                          Detected topics: {item.themes.map((t) => t.label).join(' · ')}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <input
                          type="text"
                          placeholder="Write official KUKA TRADERS store reply..."
                          value={draft}
                          onChange={(e) =>
                            setReplyDrafts({ ...replyDrafts, [r.id]: e.target.value })
                          }
                          className="flex-1 min-w-[220px] px-3 py-1.5 rounded-lg border border-stone-300 text-stone-900 placeholder:text-stone-400"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            handleModerate(
                              r,
                              r.status,
                              draft,
                              `Saved store reply for ${r.userName}'s review.`
                            )
                          }
                          className="px-3 py-1.5 rounded-lg bg-stone-900 text-white font-semibold hover:bg-stone-800 whitespace-nowrap shrink-0 disabled:opacity-50"
                        >
                          {busy ? 'Saving...' : 'Save Reply'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
