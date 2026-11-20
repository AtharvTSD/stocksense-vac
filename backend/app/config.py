"""Fixed allowlists; public requests cannot supply provider/feed URLs."""
from dataclasses import dataclass
from datetime import datetime, timezone
import os


@dataclass(frozen=True)
class Stock:
    id: str
    name: str
    symbol: str
    exchange: str
    market: str
    currency: str
    calendar: str
    aliases: tuple[str, ...]


STOCKS = {
    s.id: s for s in (
        Stock('reliance', 'Reliance Industries', 'RELIANCE.BSE', 'BSE', 'India', 'INR', 'XBOM', ('reliance industries', 'reliance', 'jio')),
        Stock('tcs', 'Tata Consultancy Services', 'TCS.BSE', 'BSE', 'India', 'INR', 'XBOM', ('tata consultancy', 'tcs')),
        Stock('apple', 'Apple', 'AAPL', 'NASDAQ', 'US', 'USD', 'XNYS', ('apple', 'iphone', 'aapl')),
        Stock('microsoft', 'Microsoft', 'MSFT', 'NASDAQ', 'US', 'USD', 'XNYS', ('microsoft', 'msft', 'azure')),
    )
}

# Publisher RSS is used as provided; never fetch whole articles or bypass access controls.
FEEDS = [
    {'id': 'tcs-newsroom', 'url': 'https://www.tcs.com/who-we-are/newsroom', 'publisher': 'TCS Newsroom', 'kind': 'official-announcement', 'format': 'html', 'market': 'India', 'stock_id': 'tcs', 'hosts': ['www.tcs.com']},
    {'id': 'reliance-newsroom', 'url': 'https://www.ril.com/news-media/press-releases', 'publisher': 'Reliance Industries', 'kind': 'official-announcement', 'format': 'html', 'market': 'India', 'stock_id': 'reliance', 'hosts': ['www.ril.com','rilstaticasset.akamaized.net']},
    {'id': 'bbc-business', 'url': 'https://feeds.bbci.co.uk/news/business/rss.xml', 'publisher': 'BBC News', 'kind': 'publisher', 'market': 'World', 'hosts': ['www.bbc.com', 'www.bbc.co.uk', 'bbc.com']},
    {'id': 'apple-newsroom', 'url': 'https://www.apple.com/newsroom/rss-feed.rss', 'publisher': 'Apple Newsroom', 'kind': 'official-announcement', 'market': 'US', 'stock_id': 'apple', 'hosts': ['www.apple.com']},
    {'id': 'microsoft-news', 'url': 'https://news.microsoft.com/feed/', 'publisher': 'Microsoft Source', 'kind': 'official-announcement', 'market': 'US', 'stock_id': 'microsoft', 'hosts': ['news.microsoft.com', 'blogs.microsoft.com', 'news.microsoft.com', 'www.microsoft.com']},
]


def now() -> datetime:
    return datetime.now(timezone.utc)


def configured(name: str) -> str:
    return os.getenv(name, '').strip()


class SafeError(Exception):
    """Only a fixed code may cross HTTP/log boundaries."""
    def __init__(self, code: str, status: int = 503):
        self.code = code
        self.status = status
        super().__init__(code)
