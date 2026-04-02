// ===== CONFIG =====
const CFG = {
  indices: {
    nifty50:   { yfSym:'^NSEI',                 nseSym:'NIFTY',      step:50,  lot:75,  label:'Nifty 50' },
    banknifty: { yfSym:'^NSEBANK',              nseSym:'BANKNIFTY',  step:100, lot:30,  label:'Bank Nifty' },
    sensex:    { yfSym:'^BSESN',                nseSym:'SENSEX',     step:100, lot:10,  label:'Sensex' },
    finnifty:  { yfSym:'NIFTY_FIN_SERVICE.NS',  nseSym:'FINNIFTY',   step:50,  lot:65,  label:'Fin Nifty' },
    midcap:    { yfSym:'^CNXMIDCAP',            nseSym:'MIDCPNIFTY', step:25,  lot:75,  label:'Mid Cap Nifty' },
  },
  // Multiple CORS proxies — fallback chain
  proxies: [
    'https://api.allorigins.win/get?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
  ],
  // Yahoo Finance base URLs
  yfChart:  'https://query1.finance.yahoo.com/v8/finance/chart/',
  yfChart2: 'https://query2.finance.yahoo.com/v8/finance/chart/',
  yfQuote:  'https://query1.finance.yahoo.com/v7/finance/quote?symbols=',
  yfQuote2: 'https://query2.finance.yahoo.com/v7/finance/quote?symbols=',
  nseBase:  'https://www.nseindia.com/api/',
};

// Shared cache
const CACHE = {};
const CACHE_TTL = { quote:20000, hist:120000, chain:60000, fii:300000 };
let proxyIdx = 0;
const sigHistory = [];
