// =====================================================
// NSE Intelligence — Free Google Apps Script Proxy
// =====================================================
// SETUP (3 minutes, completely free):
// 1. Go to https://script.google.com → New Project
// 2. Delete all existing code
// 3. Paste this entire file
// 4. Click Deploy → New Deployment
// 5. Type: Web App
// 6. Execute as: Me
// 7. Who has access: Anyone
// 8. Click Deploy → Copy the Web App URL
// 9. Paste that URL in the dashboard Settings
// =====================================================

function doGet(e) {
  const url = e.parameter.url;
  
  if (!url) {
    return ContentService.createTextOutput(JSON.stringify({error: 'Missing url parameter'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Security: only allow these domains
  const allowed = [
    'finance.yahoo.com',
    'nseindia.com',
    'query1.finance.yahoo.com',
    'query2.finance.yahoo.com',
  ];
  
  const isAllowed = allowed.some(d => url.includes(d));
  if (!isAllowed) {
    return ContentService.createTextOutput(JSON.stringify({error: 'Domain not allowed'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  try {
    const options = {
      method: 'get',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      muteHttpExceptions: true,
      followRedirects: true,
    };
    
    // NSE requires extra headers
    if (url.includes('nseindia.com')) {
      options.headers['Referer'] = 'https://www.nseindia.com/';
      options.headers['Origin'] = 'https://www.nseindia.com';
      options.headers['Accept'] = 'application/json, text/plain, */*';
      options.headers['Accept-Encoding'] = 'gzip, deflate, br';
      options.headers['Connection'] = 'keep-alive';
      
      // First visit NSE homepage to get session cookie
      const homeResp = UrlFetchApp.fetch('https://www.nseindia.com/', {
        method: 'get',
        headers: options.headers,
        muteHttpExceptions: true,
      });
      
      // Get cookies from home response
      const cookies = homeResp.getAllHeaders()['Set-Cookie'];
      if (cookies) {
        const cookieStr = Array.isArray(cookies) ? cookies.map(c => c.split(';')[0]).join('; ') : cookies.split(';')[0];
        options.headers['Cookie'] = cookieStr;
      }
      
      // Small delay to avoid rate limiting
      Utilities.sleep(500);
    }
    
    const response = UrlFetchApp.fetch(url, options);
    const content = response.getContentText();
    const statusCode = response.getResponseCode();
    
    // Wrap in allorigins-compatible format
    const result = {
      contents: content,
      status: { http_code: statusCode },
    };
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({error: err.toString(), contents: '{}'}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Handle POST (for CORS preflight)
function doPost(e) {
  return doGet(e);
}
