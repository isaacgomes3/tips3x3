const url = 'https://understat.com/league/EPL/2025';
const res = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'text/html',
  },
});
console.log('status', res.status);
const html = await res.text();
console.log('len', html.length);
const m = html.match(/datesData\s*=\s*JSON\.parse\('([^']+)'\)/);
console.log('datesData', !!m);
if (m) {
  const decoded = m[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  const data = JSON.parse(decoded);
  console.log('matches', data.length, data[0]);
}
