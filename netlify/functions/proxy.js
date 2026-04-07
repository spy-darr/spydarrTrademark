javascript
const fetch = require('node-fetch');

exports.handler = async (event) => {
  const { url } = JSON.parse(event.body || '{}');
  if (!url) return { statusCode: 400, body: 'Missing url' };
  
  // Whitelist only safe domains
  const allowed = ['finance.yahoo.com', 'nseindia.com', 'api.anthropic.com'];
  if (!allowed.some(d => url.includes(d))) {
    return { statusCode: 403, body: 'Domain not allowed' };
  }
  
  try {
    const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };
    if (url.includes('nseindia.com')) {
      headers['Referer'] = 'https://www.nseindia.com';
      headers['Cookie'] = ''; // NSE may need session cookie — see notes
    }
    const res = await fetch(url, { headers });
    const body = await res.text();
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: body })
    };
  } catch(e) {
    return { statusCode: 500, body: e.message };
  }
}
