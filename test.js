/* ───────────────────────────────────────────
   Test suite: Convertitore PDF → CSV
   ─────────────────────────────────────────── */

const http = require('http');
const path = require('path');

const BASE = 'http://localhost:4599';
let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + name);
  } catch (err) {
    failed++;
    console.log('  \x1b[31m✗\x1b[0m ' + name);
    console.log('    ' + err.message);
  }
}

function fetchJSON(url, options = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      method: options.method || 'GET',
      headers: options.headers || {}
    };
    if (options.body != null) {
      const bodyBuf = typeof options.body === 'string' ? Buffer.from(options.body) : options.body;
      opts.headers['Content-Length'] = bodyBuf.length;
    }
    const req = http.request(url, opts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (options.body != null) {
      const bodyToWrite = typeof options.body === 'string' ? options.body : options.body;
      req.write(bodyToWrite);
    }
    req.end();
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

async function waitForServer(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      await fetchText(BASE + '/');
      return;
    } catch { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error('Server non raggiungibile dopo vari tentativi');
}

async function run() {
  console.log('\nTest: Convertitore PDF → CSV\n');

  await waitForServer();

  /* 1. Homepage */
  await runTest('GET / restituisce HTML (200)', async () => {
    const { status, body } = await fetchText(BASE + '/');
    if (status !== 200) throw new Error('Status: ' + status);
    if (!body.includes('<!DOCTYPE html>')) throw new Error('Non è HTML');
  });

  /* 2. robots.txt */
  await runTest('GET /robots.txt esiste', async () => {
    const { status, body } = await fetchText(BASE + '/robots.txt');
    if (status !== 200) throw new Error('Status: ' + status);
    if (!body.includes('User-agent')) throw new Error('Contenuto mancante');
  });

  /* 3. sitemap.xml */
  await runTest('GET /sitemap.xml esiste', async () => {
    const { status, body } = await fetchText(BASE + '/sitemap.xml');
    if (status !== 200) throw new Error('Status: ' + status);
    if (!body.includes('urlset')) throw new Error('Contenuto mancante');
  });

  /* 4. Upload senza file → 400 */
  await runTest('POST /api/upload senza file → 400', async () => {
    const boundary = '----TestBoundary';
    const body = '--' + boundary + '--\r\n';
    const { status, data } = await fetchJSON(BASE + '/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
      body
    });
    if (status !== 400) throw new Error('Status: ' + status);
    if (!data.error) throw new Error('Manca messaggio errore');
  });

  /* 5. Stato job inesistente → 404 */
  await runTest('GET /api/status/:id inesistente → 404', async () => {
    const { status } = await fetchJSON(BASE + '/api/status/job-inesistente-12345');
    if (status !== 404) throw new Error('Status: ' + status);
  });

  /* 6. Content-Type CSS */
  await runTest('GET /style.css Content-Type corretto', async () => {
    const { status, headers } = await fetchText(BASE + '/style.css');
    if (status !== 200) throw new Error('Status: ' + status);
    const ct = headers['content-type'] || '';
    if (!ct.includes('text/css')) throw new Error('Content-Type: ' + ct);
  });

  /* 7. Content-Type JS */
  await runTest('GET /app.js Content-Type corretto', async () => {
    const { status, headers } = await fetchText(BASE + '/app.js');
    if (status !== 200) throw new Error('Status: ' + status);
    const ct = headers['content-type'] || '';
    if (!ct.includes('javascript')) throw new Error('Content-Type: ' + ct);
  });

  /* 8. Accessibilità */
  await runTest('HTML: accessibilità (lang, viewport, landmark, label)', async () => {
    const { body } = await fetchText(BASE + '/');
    const checks = [
      ['lang="it"', '<html lang="it"'],
      ['viewport meta', '<meta name="viewport"'],
      ['<header>', '<header'],
      ['<main>', '<main'],
      ['<footer>', '<footer'],
      ['aria-label', 'aria-label='],
      ['<h1>', '<h1'],
      ['<label> (visually-hidden)', 'visually-hidden'],
    ];
    for (const [name, marker] of checks) {
      if (!body.includes(marker)) throw new Error('Manca: ' + name);
    }
  });

  /* 9. SEO: meta description */
  await runTest('HTML: meta description presente', async () => {
    const { body } = await fetchText(BASE + '/');
    if (!body.includes('meta name="description"')) throw new Error('Manca meta description');
  });

  /* 10. SEO: canonical */
  await runTest('HTML: canonical link presente', async () => {
    const { body } = await fetchText(BASE + '/');
    if (!body.includes('rel="canonical"')) throw new Error('Manca canonical link');
  });

  /* 11. SEO: Open Graph */
  await runTest('HTML: Open Graph tags presenti', async () => {
    const { body } = await fetchText(BASE + '/');
    if (!body.includes('og:title')) throw new Error('Manca og:title');
    if (!body.includes('og:description')) throw new Error('Manca og:description');
  });

  /* 12. SEO: JSON-LD */
  await runTest('HTML: JSON-LD structured data', async () => {
    const { body } = await fetchText(BASE + '/');
    if (!body.includes('application/ld+json')) throw new Error('Manca JSON-LD');
    if (!body.includes('WebApplication')) throw new Error('Manca WebApplication');
  });

  /* 13. CSS design tokens */
  await runTest('CSS: custom properties (design token)', async () => {
    const { body } = await fetchText(BASE + '/style.css');
    if (!body.includes('--ink-deep')) throw new Error('Manca --ink-deep');
    if (!body.includes('--paper')) throw new Error('Manca --paper');
  });

  /* 14. CSS: prefers-reduced-motion */
  await runTest('CSS: prefers-reduced-motion', async () => {
    const { body } = await fetchText(BASE + '/style.css');
    if (!body.includes('prefers-reduced-motion')) throw new Error('Manca prefers-reduced-motion');
  });

  /* 15. CSS: responsive */
  await runTest('CSS: media query responsive', async () => {
    const { body } = await fetchText(BASE + '/style.css');
    if (!body.includes('@media')) throw new Error('Manca @media');
  });

  /* 16. CSS: focus-visible */
  await runTest('CSS: focus-visible per tastiera', async () => {
    const { body } = await fetchText(BASE + '/style.css');
    if (!body.includes('focus-visible')) throw new Error('Manca focus-visible');
  });

  /* 17. CSS: tap target */
  await runTest('CSS: tap target >= 44px', async () => {
    const { body } = await fetchText(BASE + '/style.css');
    if (!body.includes('min-height: 44px')) throw new Error('Manca min-height: 44px');
  });

  /* 18. JS: error handling */
  await runTest('JS: gestione errori e fetch', async () => {
    const { body } = await fetchText(BASE + '/app.js');
    if (!body.includes('catch')) throw new Error('Manca catch');
    if (!body.includes('fetch(')) throw new Error('Manca fetch');
  });

  /* 19. JS: clipboard */
  await runTest('JS: supporto clipboard', async () => {
    const { body } = await fetchText(BASE + '/app.js');
    if (!body.includes('clipboard') && !body.includes('execCommand')) throw new Error('Manca clipboard');
  });

  /* 20. Coda: upload di PDF reale e polling */
  await runTest('Flusso completo: upload PDF → CSV', async () => {
    /* PDF valido generato con pdfkit, testato con pdf-parse */
    const pdfBase64 =
      'JVBERi0xLjMKJf////8KNyAwIG9iago8PAovVHlwZSAvUGFnZQovUGFyZW50IDEgMCBSCi' +
      '9NZWRpYUJveCBbMCAwIDU5NS4yOCA4NDEuODldCi9Db250ZW50cyA1IDAgUgovUmVzb3VyY2' +
      'VzIDYgMCBSCi9Vc2VyVW5pdCAxCj4+CmVuZG9iago2IDAgb2JqCjw8Ci9Qcm9jU2V0IFsvU' +
      'ERGIC9UZXh0IC9JbWFnZUIgL0ltYWdlQyAvSW1hZ2VJXQovRm9udCA8PAovRjIgOCAwIFIK' +
      'Pj4KL0NvbG9yU3BhY2UgPDwKPj4KPj4KZW5kb2JqCjUgMCBvYmoKPDwKL0xlbmd0aCAxNzA' +
      'KL0ZpbHRlciAvRmxhdGVEZWNvZGUKPj4Kc3RyZWFtCnicnZC9CkIxDIX3PkVewGvSNKctiI' +
      'Ogg5vQTZzuz3YH33+xgovYgkogwzmBfHxCXGcjdaUgQ8o0ru7upBUfyisXMqaoNoDK6rYnT' +
      '8JUFnfdhRkLJpjn1gStbUTnJlgMM++Jb1TO7ljc5UsQzw2QCRI9MpYWiHksUaMit1pVtT8w' +
      'uOVjjIZcH0nTxxNQqg9F+kRRr+l3DOS+De3YAKy2oWMjqH/DeAD3RXIiCmVuZHN0cmVhbQp' +
      'lbmRvYmoKMTAgMCBvYmoKKFBERktpdCkKZW5kb2JqCjExIDAgb2JqCihQREZLaXQpCmVuZG' +
      '9iagoxMiAwIG9iagooRDoyMDI2MDcwNzE5MjA1NFopCmVuZG9iago5IDAgb2JqCjw8Ci9Qcm' +
      '9kdWNlciAxMCAwIFIKL0NyZWF0b3IgMTEgMCBSCi9DcmVhdGlvbkRhdGUgMTIgMCBSCj4+Cm' +
      'VuZG9iago4IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9CYXNlRm9udCAvQ291cmllcgovU3VidH' +
      'lwZSAvVHlwZTEKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKPj4KZW5kb2JqCjQgMCBvYm' +
      'oKPDwKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCi' +
      '9OYW1lcyAyIDAgUgo+PgplbmRvYmoKMSAwIG9iago8PAovVHlwZSAvUGFnZXMKL0NvdW50I' +
      'DEKL0tpZHMgWzcgMCBSXQo+PgplbmRvYmoKMiAwIG9iago8PAovRGVzdHMgPDwKICAvTmFtZ' +
      'XMgWwpdCj4+Cj4+CmVuZG9iagp4cmVmCjAgMTMKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAw' +
      'MDAwODI1IDAwMDAwIG4gCjAwMDAwMDA4ODIgMDAwMDAgbiAKMDAwMDAwMDc2MyAwMDAwMCB' +
      'uIAowMDAwMDAwNzQyIDAwMDAwIG4gCjAwMDAwMDAyNDQgMDAwMDAgbiAKMDAwMDAwMDEzNy' +
      'AwMDAwMCBuIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDA2NDcgMDAwMDAgbiAKMDAwMD' +
      'AwMDU3MiAwMDAwMCBuIAowMDAwMDAwNDg2IDAwMDAwIG4gCjAwMDAwMDA1MTEgMDAwMDAgbi' +
      'AKMDAwMDAwMDUzNiAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDEzCi9Sb290IDMgMCBSCi' +
      '9JbmZvIDkgMCBSCi9JRCBbPDNlZDc3NjJkOTFhNjBjMGNlMTdmN2NiYWY0NGNiZjgzPiA8M2' +
      'VkNzc2MmQ5MWE2MGMwY2UxN2Y3Y2JhZjQ0Y2JmODM+XQo+PgpzdGFydHhyZWYKOTI5CiUlRU' +
      '9GCg==';
    const pdfContent = Buffer.from(pdfBase64, 'base64').toString('latin1');

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    const boundary = '----TestPdfBoundary';
    const crlf = '\r\n';
    const header = '--' + boundary + crlf +
      'Content-Disposition: form-data; name="pdf"; filename="test.pdf"' + crlf +
      'Content-Type: application/pdf' + crlf + crlf;
    const footer = crlf + '--' + boundary + '--' + crlf;
    const body = Buffer.concat([Buffer.from(header), pdfBuffer, Buffer.from(footer)]);

    const uploadResult = await fetchJSON(BASE + '/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
      body
    });

    if (uploadResult.status !== 200) throw new Error('Upload fallito: ' + uploadResult.status);
    if (!uploadResult.data.jobId) throw new Error('Manca jobId nella risposta');

    const jobId = uploadResult.data.jobId;

    /* Polling */
    let job = null;
    for (let i = 0; i < 20; i++) {
      const result = await fetchJSON(BASE + '/api/status/' + jobId);
      if (result.status !== 200) throw new Error('Status check fallito: ' + result.status);
      job = result.data;
      if (job.status === 'done' || job.status === 'error') break;
      await new Promise(r => setTimeout(r, 300));
    }

    if (!job || job.status !== 'done') throw new Error('Job non completato: ' + (job ? job.status : 'null'));
    if (!job.csv) throw new Error('CSV mancante nella risposta');
    if (!job.csv.includes(',')) throw new Error('CSV non valido: ' + job.csv.substring(0, 80));
  });

  /* ── Riepilogo ── */
  console.log('\n' + '─'.repeat(40));
  console.log('Risultati: ' + passed + ' passati, ' + failed + ' falliti su ' + (passed + failed));
  console.log('─'.repeat(40) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Errore fatale nei test:', err.message);
  process.exit(1);
});
