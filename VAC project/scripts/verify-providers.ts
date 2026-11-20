import { stocks } from '../src/lib/market';
import { getPrices, getSentiment } from '../src/lib/providers';
const stock = stocks.find(s => s.id === process.argv[2]);
if (!stock) throw new Error('Choose a configured stock ID.');
const prices = await getPrices(stock);
console.log(JSON.stringify({ stock: stock.id, symbol: stock.symbol, mode: prices.mode, issue: prices.issue, sessions: prices.value.length, session: prices.value.at(-1)?.date, savedAt: prices.savedAt }));
if (process.argv.includes('--news')) {
  const news = await getSentiment(stock);
  console.log(JSON.stringify({ stock: stock.id, classifier: 'Groq', mode: news.mode, issue: news.issue, classifications: news.value, sampleHeadlines: true, savedAt: news.savedAt }));
}
