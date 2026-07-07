/* ───────────────────────────────────────────
   Convertitore PDF → CSV — Frontend
   ─────────────────────────────────────────── */

(function () {
  'use strict';

  /* ── DOM refs ── */
  const dropZone = document.getElementById('dropZone');
  const dropZoneContent = document.getElementById('dropZoneContent');
  const dropProgress = document.getElementById('dropProgress');
  const dropDone = document.getElementById('dropDone');
  const progressLabel = document.getElementById('progressLabel');
  const fileInput = document.getElementById('fileInput');
  const fileError = document.getElementById('fileError');

  const resultSection = document.getElementById('resultSection');
  const resultFilename = document.getElementById('resultFilename');
  const tablePreview = document.getElementById('tablePreview');
  const resultStats = document.getElementById('resultStats');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyBtn = document.getElementById('copyBtn');
  const resetBtn = document.getElementById('resetBtn');

  const errorSection = document.getElementById('errorSection');
  const errorMessage = document.getElementById('errorMessage');
  const retryBtn = document.getElementById('retryBtn');

  /* ── Stato ── */
  let currentJobId = null;
  let pollTimer = null;
  let currentCsv = null;
  let currentFilename = null;

  /* ── Helpers ── */
  function showError(msg) {
    fileError.textContent = msg;
    fileError.hidden = false;
  }

  function clearError() {
    fileError.textContent = '';
    fileError.hidden = true;
  }

  function resetUI() {
    clearError();
    dropZone.classList.remove('uploading', 'done');
    dropZoneContent.hidden = false;
    dropProgress.hidden = true;
    dropDone.hidden = true;
    resultSection.hidden = true;
    errorSection.hidden = true;
    currentJobId = null;
    currentCsv = null;
    currentFilename = null;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    fileInput.value = '';
  }

  function setUploading() {
    clearError();
    dropZone.classList.add('uploading');
    dropZone.classList.remove('done');
    dropZoneContent.hidden = true;
    dropProgress.hidden = false;
    dropDone.hidden = true;
    progressLabel.textContent = 'Caricamento in corso…';
    resultSection.hidden = true;
    errorSection.hidden = true;
  }

  function setProcessing() {
    progressLabel.textContent = 'Estrazione tabelle in corso…';
  }

  function setDone(csv, filename) {
    currentCsv = csv;
    currentFilename = filename;
    dropZone.classList.remove('uploading');
    dropZone.classList.add('done');
    dropProgress.hidden = true;
    dropDone.hidden = false;
    dropZoneContent.hidden = true;

    resultFilename.textContent = filename.replace(/\.pdf$/i, '.csv');
    tablePreview.textContent = truncateCsv(csv);
    resultSection.hidden = false;
    errorSection.hidden = true;

    const lines = csv.split('\n');
    const cols = lines[0] ? lines[0].split(',').length : 0;
    resultStats.textContent = lines.length + ' righe · ' + cols + ' colonne';
  }

  function setError(msg) {
    dropZone.classList.remove('uploading', 'done');
    dropZoneContent.hidden = false;
    dropProgress.hidden = true;
    dropDone.hidden = true;
    resultSection.hidden = true;
    errorSection.hidden = false;
    errorMessage.textContent = msg;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function truncateCsv(csv) {
    const lines = csv.split('\n');
    const maxLines = 50;
    if (lines.length <= maxLines) return csv;
    return lines.slice(0, maxLines).join('\n') + '\n… (' + (lines.length - maxLines) + ' righe omesse nell\'anteprima)';
  }

  /* ── API ── */
  async function uploadPdf(file) {
    const formData = new FormData();
    formData.append('pdf', file);

    const res = await fetch('api/upload', { method: 'POST', body: formData });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Errore durante il caricamento (HTTP ' + res.status + ')');
    }
    return res.json();
  }

  async function pollStatus(jobId) {
    const res = await fetch('api/status/' + encodeURIComponent(jobId));
    if (!res.ok) {
      if (res.status === 404) throw new Error('Job scaduto o non trovato. Ricarica il file.');
      throw new Error('Errore nel controllo stato (HTTP ' + res.status + ')');
    }
    return res.json();
  }

  /* ── Flusso principale ── */
  async function handleFile(file) {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      showError('Il file deve essere in formato PDF.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showError('Il file supera il limite di 10 MB.');
      return;
    }

    setUploading();

    try {
      const { jobId } = await uploadPdf(file);
      currentJobId = jobId;
      setProcessing();

      /* Polling ogni 500ms */
      pollTimer = setInterval(async () => {
        try {
          const job = await pollStatus(jobId);
          if (job.status === 'done') {
            clearInterval(pollTimer);
            pollTimer = null;
            setDone(job.csv, job.filename || file.name);
          } else if (job.status === 'error') {
            clearInterval(pollTimer);
            pollTimer = null;
            setError(job.error || 'Errore sconosciuto durante l\'estrazione.');
          }
          /* 'queued' o 'processing' → continua il polling */
        } catch (err) {
          clearInterval(pollTimer);
          pollTimer = null;
          setError(err.message);
        }
      }, 500);

      /* Timeout dopo 60 secondi */
      setTimeout(() => {
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
          setError('L\'elaborazione sta richiedendo troppo tempo. Verifica che il PDF non sia corrotto e riprova.');
        }
      }, 60000);

    } catch (err) {
      setError(err.message);
    }
  }

  /* ── Event listeners ── */

  /* Click sulla drop zone */
  dropZone.addEventListener('click', () => {
    if (dropZone.classList.contains('uploading')) return;
    fileInput.click();
  });

  /* Tastiera: Enter/Space sulla drop zone */
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!dropZone.classList.contains('uploading')) {
        fileInput.click();
      }
    }
  });

  /* File selezionato da input */
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) handleFile(file);
  });

  /* Drag & drop */
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dropZone.classList.contains('uploading')) {
      dropZone.classList.add('dragover');
    }
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (dropZone.classList.contains('uploading')) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  /* Download */
  downloadBtn.addEventListener('click', () => {
    if (!currentCsv) return;
    const blob = new Blob([currentCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFilename ? currentFilename.replace(/\.pdf$/i, '.csv') : 'dati.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  /* Copia negli appunti */
  copyBtn.addEventListener('click', async () => {
    if (!currentCsv) return;
    try {
      await navigator.clipboard.writeText(currentCsv);
      const origText = copyBtn.textContent;
      copyBtn.textContent = '✓ Copiato!';
      setTimeout(() => { copyBtn.textContent = origText; }, 1500);
    } catch {
      /* Fallback per contesti non sicuri */
      const ta = document.createElement('textarea');
      ta.value = currentCsv;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      const origText = copyBtn.textContent;
      copyBtn.textContent = '✓ Copiato!';
      setTimeout(() => { copyBtn.textContent = origText; }, 1500);
    }
  });

  /* Reset */
  resetBtn.addEventListener('click', resetUI);
  retryBtn.addEventListener('click', resetUI);

})();
