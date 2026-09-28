/**
 * AnyBox — Material Design 3 Expressive Application Logic
 */

(function () {
  'use strict';

  let currentKeybox = {
    rawBase64: null,
    decodedXml: null,
    hash: null,
    metadata: null,
  };

  // Theme Management
  const btnThemePalette = document.getElementById('btn-theme-palette');
  const themePopover = document.getElementById('theme-popover');
  const themeSwatches = document.querySelectorAll('.theme-swatch');

  const savedTheme = localStorage.getItem('anybox_theme') || 'purple';
  applyTheme(savedTheme);

  function applyTheme(themeName) {
    document.documentElement.setAttribute('data-color-preset', themeName);
    localStorage.setItem('anybox_theme', themeName);

    themeSwatches.forEach(swatch => {
      if (swatch.getAttribute('data-theme') === themeName) {
        swatch.classList.add('active');
      } else {
        swatch.classList.remove('active');
      }
    });
  }

  if (btnThemePalette && themePopover) {
    btnThemePalette.addEventListener('click', (e) => {
      e.stopPropagation();
      themePopover.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!themePopover.contains(e.target) && e.target !== btnThemePalette) {
        themePopover.classList.add('hidden');
      }
    });

    themeSwatches.forEach(swatch => {
      swatch.addEventListener('click', (e) => {
        e.stopPropagation();
        const theme = swatch.getAttribute('data-theme');
        applyTheme(theme);
        themePopover.classList.add('hidden');
        showToast(`Theme updated: ${swatch.getAttribute('title').split(' ')[0]}`);
      });
    });
  }

  // DOM Elements
  const statusDot = document.getElementById('status-dot');
  const statusBadge = document.getElementById('status-badge');
  const statusMeta = document.getElementById('status-meta');
  const statusNote = document.getElementById('status-note');
  const btnRefreshStatus = document.getElementById('btn-refresh-status');

  const btnFetch = document.getElementById('btn-fetch');
  const btnFetchText = document.getElementById('btn-fetch-text');
  const fetchSpinner = document.getElementById('fetch-spinner');

  const errorAlert = document.getElementById('error-alert');
  const errorTitle = document.getElementById('error-title');
  const errorMessage = document.getElementById('error-message');

  const resultsSection = document.getElementById('results-section');
  const metaDeviceId = document.getElementById('meta-device-id');
  const metaAlgorithms = document.getElementById('meta-algorithms');
  const metaCerts = document.getElementById('meta-certs');
  const metaSize = document.getElementById('meta-size');
  const metaHash = document.getElementById('meta-hash');

  const btnCopyHash = document.getElementById('btn-copy-hash');
  const btnDownloadXml = document.getElementById('btn-download-xml');
  const btnCopyXml = document.getElementById('btn-copy-xml');
  const btnCopyB64 = document.getElementById('btn-copy-b64');
  const btnToggleViewer = document.getElementById('btn-toggle-viewer');
  const btnViewerText = document.getElementById('btn-viewer-text');
  const xmlViewerContainer = document.getElementById('xml-viewer-container');
  const xmlCodeBlock = document.getElementById('xml-code-block');
  const viewerLineCount = document.getElementById('viewer-line-count');

  const toastContainer = document.getElementById('toast-container');

  // M3 Snackbar / Toast helper
  function showToast(message, duration = 2400) {
    const snackbar = document.createElement('div');
    snackbar.className = 'm3-snackbar';
    snackbar.textContent = message;
    toastContainer.appendChild(snackbar);

    setTimeout(() => {
      snackbar.style.opacity = '0';
      snackbar.style.transition = 'opacity 0.15s ease-out';
      setTimeout(() => snackbar.remove(), 150);
    }, duration);
  }

  // Error alert helper
  function showError(title, message) {
    errorTitle.textContent = title;
    errorMessage.textContent = message;
    errorAlert.classList.remove('hidden');
  }

  function hideError() {
    errorAlert.classList.add('hidden');
  }

  // Compute SHA-256 using Web Crypto API
  async function computeSha256(uint8Array) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Check Service Status via local API endpoint
  async function checkServiceStatus() {
    statusBadge.textContent = 'Checking';
    if (statusDot) statusDot.className = 'network-dot';
    statusMeta.textContent = '-- ms';
    btnRefreshStatus.disabled = true;

    const startTime = performance.now();

    try {
      const resp = await fetch('/api/status', { cache: 'no-store' });
      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      const latency = data.latency || Math.round(performance.now() - startTime);
      statusBadge.textContent = data.status || 'Online';
      if (statusDot) statusDot.className = 'network-dot online';
      statusMeta.textContent = `${latency} ms`;
      if (statusNote) statusNote.textContent = 'Online';
    } catch (err) {
      statusBadge.textContent = 'Offline';
      if (statusDot) statusDot.className = 'network-dot offline';
      statusMeta.textContent = 'Err';
      if (statusNote) statusNote.textContent = 'Unavailable';
    } finally {
      btnRefreshStatus.disabled = false;
    }
  }

  btnRefreshStatus.addEventListener('click', checkServiceStatus);

  // Parse Keybox XML String
  function parseKeyboxXml(xmlString) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'application/xml');

    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      throw new Error('Malformed XML payload received.');
    }

    const rootTag = xmlDoc.documentElement.nodeName;
    if (rootTag !== 'AndroidAttestation' && !xmlDoc.querySelector('Keybox')) {
      throw new Error('Payload does not match expected AndroidAttestation schema.');
    }

    // Extract device ID
    const keyboxElement = xmlDoc.querySelector('Keybox');
    const deviceId = keyboxElement ? (keyboxElement.getAttribute('DeviceID') || 'Configured') : 'Active';

    // Extract algorithms
    const keyElements = xmlDoc.querySelectorAll('Key');
    const algorithms = [];
    keyElements.forEach(k => {
      const alg = k.getAttribute('algorithm');
      if (alg && !algorithms.includes(alg.toUpperCase())) {
        algorithms.push(alg.toUpperCase());
      }
    });

    // Extract certificate counts
    let totalCerts = 0;
    const certNumberElements = xmlDoc.querySelectorAll('NumberOfCertificates');
    if (certNumberElements.length > 0) {
      certNumberElements.forEach(el => {
        totalCerts += parseInt(el.textContent.trim(), 10) || 0;
      });
    } else {
      totalCerts = xmlDoc.querySelectorAll('Certificate').length;
    }

    return {
      deviceId,
      algorithms: algorithms.length ? algorithms.join(' + ') : 'ECDSA / RSA',
      totalCerts: totalCerts ? `${totalCerts} certificates` : 'Multiple',
    };
  }

  // Fetch Keybox Action via local API endpoint
  async function fetchKeybox() {
    hideError();
    btnFetch.disabled = true;
    fetchSpinner.classList.remove('hidden');
    btnFetchText.textContent = 'Retrieving...';

    try {
      const resp = await fetch('/api/keybox', { cache: 'no-store' });
      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      const rawBase64 = data.base64;
      if (!rawBase64 || rawBase64.length === 0) {
        throw new Error('Received an empty payload.');
      }

      // Base64 Decode
      const binaryString = atob(rawBase64);
      const uint8Bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        uint8Bytes[i] = binaryString.charCodeAt(i);
      }

      const decodedXml = new TextDecoder('utf-8').decode(uint8Bytes);

      // Verify and inspect XML
      const metadata = parseKeyboxXml(decodedXml);
      const hash = await computeSha256(uint8Bytes);

      // Save state
      currentKeybox = {
        rawBase64,
        decodedXml,
        hash,
        metadata,
        sizeBytes: uint8Bytes.length,
      };

      // Populate UI
      metaDeviceId.textContent = metadata.deviceId;
      metaAlgorithms.textContent = metadata.algorithms;
      metaCerts.textContent = metadata.totalCerts;
      metaSize.textContent = `${(currentKeybox.sizeBytes / 1024).toFixed(2)} KB (${currentKeybox.sizeBytes} B)`;
      metaHash.textContent = hash;

      // Populate XML preview
      xmlCodeBlock.querySelector('code').textContent = decodedXml;
      const lines = decodedXml.split('\n').length;
      viewerLineCount.textContent = `${lines} lines`;

      resultsSection.classList.remove('hidden');
      showToast('Keybox verified');
    } catch (err) {
      showError('Retrieval Error', err.message || 'Failed to retrieve attestation payload.');
    } finally {
      btnFetch.disabled = false;
      fetchSpinner.classList.add('hidden');
      btnFetchText.textContent = 'Fetch Keybox';
    }
  }

  btnFetch.addEventListener('click', fetchKeybox);

  // Action: Download XML File
  btnDownloadXml.addEventListener('click', () => {
    if (!currentKeybox.decodedXml) return;
    const blob = new Blob([currentKeybox.decodedXml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'keybox.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded keybox.xml');
  });

  // Action: Copy XML to Clipboard
  btnCopyXml.addEventListener('click', async () => {
    if (!currentKeybox.decodedXml) return;
    try {
      await navigator.clipboard.writeText(currentKeybox.decodedXml);
      showToast('Copied XML to clipboard');
    } catch (err) {
      showToast('Copy failed');
    }
  });

  // Action: Copy Base64 to Clipboard
  btnCopyB64.addEventListener('click', async () => {
    if (!currentKeybox.rawBase64) return;
    try {
      await navigator.clipboard.writeText(currentKeybox.rawBase64);
      showToast('Copied Base64 to clipboard');
    } catch (err) {
      showToast('Copy failed');
    }
  });

  // Action: Copy SHA-256
  btnCopyHash.addEventListener('click', async () => {
    if (!currentKeybox.hash) return;
    try {
      await navigator.clipboard.writeText(currentKeybox.hash);
      showToast('Copied SHA-256 hash');
    } catch (err) {
      showToast('Copy failed');
    }
  });

  // Action: Toggle XML Viewer
  btnToggleViewer.addEventListener('click', () => {
    const isHidden = xmlViewerContainer.classList.contains('hidden');
    if (isHidden) {
      xmlViewerContainer.classList.remove('hidden');
      btnViewerText.textContent = 'Hide XML';
    } else {
      xmlViewerContainer.classList.add('hidden');
      btnViewerText.textContent = 'View XML';
    }
  });

  // Initial service status check on page load
  checkServiceStatus();
})();
