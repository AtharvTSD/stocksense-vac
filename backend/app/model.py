"""Small numerical models with explicit availability cutoffs and paired holdouts."""
from datetime import datetime, timedelta
import numpy as np
from .market import next_session, session_close
from .config import SafeError, now

NEWS_WEIGHT = 0.002  # A disclosed sensitivity parameter, not an accuracy claim.


def eligible_news(news: list[dict], cutoff: datetime) -> list[dict]:
    return [n for n in news if n.get('relevant') and not n.get('sample', False)
            and cutoff - timedelta(days=3) <= datetime.fromisoformat(str(n['published_at']).replace('Z', '+00:00')) <= cutoff
            and datetime.fromisoformat(str(n['first_seen_at']).replace('Z', '+00:00')) <= cutoff]


def sentiment_feature(news: list[dict], cutoff: datetime) -> tuple[float, int]:
    eligible = eligible_news(news, cutoff)
    score = float(np.mean([{'positive': 1, 'neutral': 0, 'negative': -1}[n['sentiment']] for n in eligible])) if eligible else 0.0
    return score, len(eligible)


def estimate(prefix: list[dict], sentiment: float = 0) -> float:
    values = np.asarray([float(p['close']) for p in prefix[-21:]])
    mean_return = float(np.mean(values[1:] / values[:-1] - 1))
    return float(values[-1] * (1 + np.clip(mean_return + NEWS_WEIGHT * sentiment, -.10, .10)))


def forecast(stock_id: str, prices: list[dict], news: list[dict], clock: datetime | None = None) -> dict:
    if len(prices) < 60:
        return {'state': 'insufficient-history', 'minimum_sessions': 60, 'available_sessions': len(prices)}
    latest = prices[-1]
    try:
        cutoff = session_close(stock_id, latest['date'])
        target = next_session(stock_id, latest['date'])
    except SafeError as error:
        return {'state': error.code}
    score, count = sentiment_feature(news, cutoff)
    price_only = estimate(prices)
    combined = estimate(prices, score)
    active = combined if count else price_only
    change = (active / latest['close'] - 1) * 100
    errors = {'price_only': [], 'news_informed': [], 'last_close': []}
    covered = 0
    for i in range(len(prices) - 10, len(prices)):
        prior = prices[:i]
        historical_score, n = sentiment_feature(news, session_close(stock_id, prior[-1]['date']))
        covered += bool(n)
        errors['price_only'].append(abs(estimate(prior) - prices[i]['close']))
        errors['news_informed'].append(abs(estimate(prior, historical_score) - prices[i]['close']))
        errors['last_close'].append(abs(prior[-1]['close'] - prices[i]['close']))
    return {'state': 'experimental', 'mode': 'news-informed' if count else 'price-only', 'estimated_close': round(active, 4), 'price_only_close': round(price_only, 4), 'expected_change_pct': round(change, 4),
            'direction': 'Flat' if abs(change) <= .1 else 'Up' if change > 0 else 'Down', 'target_session': target, 'cutoff': cutoff.isoformat(), 'eligible_news': count,
            'target_is_past': session_close(stock_id,target) <= (clock or now()),
            'evaluation': {'sessions': [p['date'] for p in prices[-10:]], 'price_only_mae': float(np.mean(errors['price_only'])), 'baseline_mae': float(np.mean(errors['last_close'])),
                           'news_informed_mae': float(np.mean(errors['news_informed'])) if covered >= 8 else None, 'news_covered_sessions': covered,
                           'coverage_gap': None if covered >= 8 else 'Too few timestamp-aligned news sessions for a reliable news-model comparison.'},
            'method': '20-return mean; news-informed path adds a fixed 0.2% × mean sentiment sensitivity. This coefficient is not fitted or validated.',
            'limitations': 'Raw unadjusted closes; no confidence interval or predictive accuracy claim. NASDAQ uses the shared US equity session calendar.'}
