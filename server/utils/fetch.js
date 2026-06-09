const http = require('http');
const https = require('https');
const { URL } = require('url');

function fetchText(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const requestOptions = {
      headers: options.headers || {},
      timeout: options.timeoutMs || options.timeout || 30000,
    };

    if (parsed.protocol === 'https:') {
      requestOptions.rejectUnauthorized = process.env.TLS_INSECURE !== 'true';
    }

    const req = lib.get(url, requestOptions, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchText(new URL(res.headers.location, url).toString(), options).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });

    req.on('timeout', () => req.destroy(new Error(`Timeout fetching ${url}`)));
    req.on('error', reject);
  });
}

async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}

module.exports = {
  fetchText,
  fetchJson,
};
