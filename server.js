/* 
 * IMPORTANTE: pdf-parse e fs vanno caricati PRIMA di Express.
 * Express modifica lo stato globale interferendo con pdf.js.
 * Un warm-up con un PDF valido (prima di caricare Express) risolve il problema.
 */
const fs = require('fs');
const pdfParse = require('pdf-parse');
const path = require('path');
const crypto = require('crypto');

/* PDF valido per il warm-up (generato con pdfkit, testato con pdf-parse) */
const WARMUP_PDF_BASE64 =
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

const warmupBuffer = Buffer.from(WARMUP_PDF_BASE64, 'base64');

/* Esegui il warm-up PRIMA di caricare Express */
pdfParse(warmupBuffer).catch(() => {});

const express = require('express');
const multer = require('multer');

const app = express();

function uuidv4() {
  return crypto.randomUUID();
}

/* ── Multer: upload in memoria (max 10 MB) ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Solo file PDF sono accettati'));
  }
});

/* ── Coda in memoria ── */
const jobs = new Map();
const queue = [];
let processing = false;

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;

  while (queue.length > 0) {
    const jobId = queue.shift();
    const job = jobs.get(jobId);
    if (!job || job.status !== 'queued') continue;

    job.status = 'processing';
    try {
      const csv = await extractTablesFromPdfBuffer(job.buffer);
      job.csv = csv;
      job.status = 'done';
    } catch (err) {
      job.error = err.message;
      job.status = 'error';
    }
    delete job.buffer;
  }
  processing = false;
}

/* ── Estrazione tabelle ── */
async function extractTablesFromPdfBuffer(buffer) {
  const data = await pdfParse(buffer);
  return extractTablesFromText(data.text);
}

/**
 * Euristica per rilevare tabelle nel testo estratto da PDF.
 *
 * Strategia a due fasi:
 * Fase 1 — split multi-spazio: token separati da ≥2 spazi o tab.
 * Fase 2 (fallback) — split spazio singolo: se ogni riga ha lo stesso
 *   numero di token e almeno 2 colonne.
 *
 * Viene scelto il gruppo di righe consecutive con struttura omogenea
 * più numeroso. Priorità a gruppi con ≥3 colonne.
 */
function extractTablesFromText(text) {
  const rawLines = text.split(/\r?\n/);

  /* ── Fase 1: split multi-spazio (≥2 spazi) ── */
  const multiParsed = rawLines.map(raw => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const tokens = trimmed.split(/\s{2,}|\t/).map(t => t.trim()).filter(Boolean);
    return tokens.length >= 2 ? { tokens, count: tokens.length } : null;
  });

  let groups = findGroups(multiParsed);

  /* ── Fase 2 (fallback): split spazio singolo ── */
  if (groups.length === 0) {
    const singleParsed = rawLines.map(raw => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const tokens = trimmed.split(/\s+/).filter(Boolean);
      return tokens.length >= 2 ? { tokens, count: tokens.length } : null;
    });
    groups = findGroups(singleParsed);
  }

  /* ── Fase 3 (ultimo fallback): righe non consecutive ma coerenti ── */
  if (groups.length === 0) {
    const nonEmpty = rawLines.map(raw => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const tokens = trimmed.split(/\s+/).filter(Boolean);
      return tokens.length >= 2 ? { tokens, count: tokens.length } : null;
    }).filter(Boolean);

    if (nonEmpty.length >= 2) {
      const byCount = new Map();
      for (const item of nonEmpty) {
        if (!byCount.has(item.count)) byCount.set(item.count, []);
        byCount.get(item.count).push(item);
      }
      let best = null;
      for (const [count, items] of byCount) {
        if (items.length < 2) continue;
        if (!best || count > best.colCount || (count === best.colCount && items.length > best.lines.length)) {
          best = { lines: items, colCount: count };
        }
      }
      if (best) groups = [best];
    }
  }

  if (groups.length === 0) {
    throw new Error(
      'Nessuna tabella rilevata nel PDF. Assicurati che il documento contenga tabelle con almeno 2 colonne di dati.'
    );
  }

  /* Scegli il gruppo migliore */
  groups.sort((a, b) => {
    const aScore = (a.colCount >= 3 ? 1000 : 0) + a.lines.length;
    const bScore = (b.colCount >= 3 ? 1000 : 0) + b.lines.length;
    return bScore - aScore;
  });

  const best = groups[0];
  const rows = best.lines.map(l => l.tokens);

  const maxCols = Math.max(...rows.map(r => r.length));
  const aligned = rows.map(row => {
    while (row.length < maxCols) row.push('');
    return row;
  });

  return rowsToCsv(aligned);
}

function findGroups(parsedLines) {
  const groups = [];
  let current = null;

  for (const pl of parsedLines) {
    if (pl && pl.count >= 2) {
      if (!current) {
        current = { lines: [pl], colCount: pl.count };
      } else if (pl.count === current.colCount) {
        current.lines.push(pl);
      } else {
        if (current.lines.length >= 2) groups.push(current);
        current = { lines: [pl], colCount: pl.count };
      }
    } else {
      if (current) {
        if (current.lines.length >= 2) groups.push(current);
        current = null;
      }
    }
  }
  if (current && current.lines.length >= 2) groups.push(current);

  return groups;
}

function escapeCsvField(val) {
  if (!val) return '';
  const s = String(val).replace(/\s+/g, ' ').trim();
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function rowsToCsv(rows) {
  return rows.map(row => row.map(escapeCsvField).join(',')).join('\n');
}

/* ── Servi i file statici ── */
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

/* ── API: upload ── */
app.post('/api/upload', upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nessun file PDF caricato.' });
  }
  const jobId = uuidv4();
  const job = {
    id: jobId,
    status: 'queued',
    csv: null,
    error: null,
    buffer: req.file.buffer,
    createdAt: Date.now(),
    filename: req.file.originalname
  };
  jobs.set(jobId, job);
  queue.push(jobId);
  processQueue();
  return res.json({ jobId, status: 'queued' });
});

/* ── API: stato ── */
app.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job non trovato.' });
  const { id, status, csv, error, filename } = job;
  return res.json({ id, status, csv, error, filename });
});

/* ── Pulizia job vecchi (>30 min) ── */
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000);

/* ── Avvia server ── */
const PORT = process.env.PORT || 4599;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server PDF→CSV in ascolto su http://0.0.0.0:${PORT}`);
});

/* Esporta per i test */
if (require.main !== module) {
  module.exports = { extractTablesFromText };
}
