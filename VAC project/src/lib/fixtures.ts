export type Stock = { ticker: string; name: string; exchange: string; currency: string; history: number[] };
export const timestamp = '06 Nov 2026, 15:30 IST';
// Missing: Real market data and AI integration are intentionally outside Exercise 1.
export const stocks: Stock[] = [
  { ticker: 'RELIANCE', name: 'Reliance Industries', exchange: 'NSE', currency: 'INR', history: [1410, 1428, 1420, 1440, 1433, 1457, 1448, 1460, 1475, 1462, 1480, 1496] },
  { ticker: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE', currency: 'INR', history: [3510, 3490, 3505, 3472, 3485, 3460, 3478, 3455, 3470, 3440, 3460, 3435] },
  { ticker: 'INFY', name: 'Infosys', exchange: 'NSE', currency: 'INR', history: [1500, 1518, 1508, 1530, 1520, 1534, 1545, 1538, 1550, 1542, 1555, 1568] },
  { ticker: 'HDFCBANK', name: 'HDFC Bank', exchange: 'NSE', currency: 'INR', history: [970, 974, 968, 980, 977, 985, 981, 989, 992, 985, 991, 996] },
];
export const prompts = [
  'Summarize the available data for this stock in simple terms.',
  'Explain this stock’s recent price trend using the displayed chart.',
  'What risks and missing information should I check before researching further?',
] as const;
export const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);
export function metrics(stock: Stock) {
  const price = stock.history.at(-1)!;
  const previous = stock.history.at(-2)!;
  return { price, change: price - previous, percent: ((price - previous) / previous) * 100 };
}
export function sampleAnswer(stock: Stock, question: string) {
  const { price, change, percent } = metrics(stock);
  const direction = change >= 0 ? 'up' : 'down';
  const overview = `${stock.name} (${stock.ticker}) has a sample closing price of ${money(price)}, ${direction} ${money(Math.abs(change))} (${Math.abs(percent).toFixed(2)}%) from the preceding sample session.`;
  const trend = `The displayed 12-session sample moves from ${money(stock.history[0])} to ${money(price)}. It ${price > stock.history[0] ? 'rises' : 'falls'} overall, with changes along the way. A short chart cannot establish a lasting trend.`;
  const risks = 'Before researching further, check financial results, debt, valuation, sector conditions and reliable dated news. Volume, fundamentals and news are missing here. Past price movements cannot guarantee future returns.';
  if (/risk|missing/i.test(question)) return `${risks}\n\n${overview}\n\nThese are fictional local fixtures, not investment recommendations.`;
  if (/trend|chart/i.test(question)) return `${trend}\n\n${overview}\n\n${risks}`;
  return `${overview}\n\n${trend}\n\n${risks}\n\nThis is a scripted sample explanation. Custom questions are preserved, but real AI interpretation is not connected.`;
}
