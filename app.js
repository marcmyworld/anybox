/**
 * AnyBox — Material Design 3 Expressive Application Logic
 * Supports multi-source attestation: Specter (rawbin) & Integrity-Box (MeowDump)
 */

(function () {
  'use strict';

  // State Management
  let currentSource = localStorage.getItem('anybox_source') || 'specter';
  let selectedSpecterProvider = 'auto';
  let sourcesMetadata = null;

  let currentKeybox = {
    rawBase64: null,
    decodedXml: null,
    hash: null,
    metadata: null,
    source: null,
    provider: null,
    version: null,
    serial: null,
    softbanned: false,
    revoked: false,
    sizeBytes: 0,
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
  const networkChip = document.getElementById('network-chip');
  const statusDot = document.getElementById('status-dot');
  const statusBadge = document.getElementById('status-badge');
  const statusMeta = document.getElementById('status-meta');
  const statusNote = document.getElementById('status-note');
  const btnRefreshStatus = document.getElementById('btn-refresh-status');

  const sourceChips = document.querySelectorAll('.source-chip');
  const sourceHint = document.getElementById('source-hint');
  const providerSelectRow = document.getElementById('provider-select-row');
  const specterProviderSelect = document.getElementById('specter-provider-select');
  const specterCatalogBadge = document.getElementById('specter-catalog-badge');
  const chipUpstream = document.getElementById('chip-upstream');

  const btnFetch = document.getElementById('btn-fetch');
  const btnFetchText = document.getElementById('btn-fetch-text');
  const fetchSpinner = document.getElementById('fetch-spinner');

  const errorAlert = document.getElementById('error-alert');
  const errorTitle = document.getElementById('error-title');
  const errorMessage = document.getElementById('error-message');

  const resultsSection = document.getElementById('results-section');
  const metaSourceTag = document.getElementById('meta-source-tag');
  const metaStatusTag = document.getElementById('meta-status-tag');
  const metaDeviceId = document.getElementById('meta-device-id');
  const metaProviderDetail = document.getElementById('meta-provider-detail');
  const metaAlgorithms = document.getElementById('meta-algorithms');
  const metaCerts = document.getElementById('meta-certs');
  const metaSize = document.getElementById('meta-size');
  const metaSerial = document.getElementById('meta-serial');
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

  const SOURCE_HINTS = {
    specter: 'rawbin.dpejoh.com cipher catalog with active provider pool',
    integritybox: 'MeowDump Megatron payload with 10x Base64, Hex & ROT13 decoding',
    upstream: 'Configured upstream endpoint via environment variables'
  };

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

  // Check Service Status via local API endpoint for active source
  async function checkServiceStatus() {
    statusBadge.textContent = 'Checking';
    if (statusDot) statusDot.className = 'network-dot';
    statusMeta.textContent = '-- ms';
    btnRefreshStatus.disabled = true;

    const startTime = performance.now();

    try {
      const resp = await fetch(`/api/status?source=${encodeURIComponent(currentSource)}`, { cache: 'no-store' });
      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
      }

      const latency = data.latency || Math.round(performance.now() - startTime);
      const isOnline = data.status && !data.status.toLowerCase().includes('offline') && !data.status.toLowerCase().includes('fail');

      statusBadge.textContent = data.status || 'Online';
      if (statusDot) statusDot.className = `network-dot ${isOnline ? 'online' : 'offline'}`;
      statusMeta.textContent = `${latency} ms`;
      if (statusNote) {
        statusNote.textContent = data.details ? `${data.status} (${data.details})` : data.status;
      }
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
  if (networkChip) {
    networkChip.addEventListener('click', checkServiceStatus);
  }

  // Load Sources and Populate Providers Dropdown
  async function initSources() {
    try {
      const res = await fetch('/api/sources', { cache: 'no-store' });
      if (!res.ok) return;

      sourcesMetadata = await res.json();

      // Configure Custom Upstream chip availability
      const upstreamSource = sourcesMetadata.sources?.find(s => s.id === 'upstream');
      if (chipUpstream && upstreamSource && !upstreamSource.available) {
        chipUpstream.title = 'Upstream URL not configured in environment';
        chipUpstream.style.opacity = '0.6';
      }

      // Populate Specter providers
      const specterSource = sourcesMetadata.sources?.find(s => s.id === 'specter');
      const specterInfo = specterSource?.specterInfo;

      if (specterInfo && Array.isArray(specterInfo.providers)) {
        specterProviderSelect.innerHTML = '';

        const autoOption = document.createElement('option');
        autoOption.value = 'auto';
        const workingStr = specterInfo.working ? ` [Preferred: ${specterInfo.working.source}]` : '';
        autoOption.textContent = `Auto (Active Working Candidate)${workingStr}`;
        specterProviderSelect.appendChild(autoOption);

        specterInfo.providers.forEach(p => {
          const opt = document.createElement('option');
          opt.value = `${p.source}::${p.version}`;
          const softTag = p.softbanned ? ' [Softbanned]' : '';
          const revokedTag = p.revoked ? ' [Revoked]' : '';
          opt.textContent = `${p.source} (${p.version})${softTag}${revokedTag}`;
          specterProviderSelect.appendChild(opt);
        });

        if (specterCatalogBadge && specterInfo.providersCount) {
          specterCatalogBadge.textContent = `${specterInfo.providersCount} providers`;
        }
      }
    } catch (err) {
      console.warn('Sources initialization notice:', err.message);
    }
  }

  // Switch Active Source
  function setSource(sourceKey) {
    currentSource = sourceKey;
    localStorage.setItem('anybox_source', sourceKey);

    sourceChips.forEach(chip => {
      const isSelected = chip.dataset.source === sourceKey;
      chip.classList.toggle('active', isSelected);
      chip.setAttribute('aria-checked', isSelected ? 'true' : 'false');
    });

    if (sourceHint) {
      sourceHint.textContent = SOURCE_HINTS[sourceKey] || '';
    }

    if (providerSelectRow) {
      providerSelectRow.classList.toggle('hidden', sourceKey !== 'specter');
    }

    checkServiceStatus();
  }

  sourceChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const source = chip.dataset.source;
      setSource(source);
    });
  });

  if (specterProviderSelect) {
    specterProviderSelect.addEventListener('change', (e) => {
      selectedSpecterProvider = e.target.value;
      if (specterCatalogBadge) {
        specterCatalogBadge.textContent = selectedSpecterProvider === 'auto' ? 'Auto (Working)' : selectedSpecterProvider.replace('::', ' ');
      }
    });
  }

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
      let queryUrl = `/api/keybox?source=${encodeURIComponent(currentSource)}`;

      if (currentSource === 'specter' && selectedSpecterProvider !== 'auto') {
        const [prov, ver] = selectedSpecterProvider.split('::');
        if (prov) queryUrl += `&provider=${encodeURIComponent(prov)}`;
        if (ver) queryUrl += `&version=${encodeURIComponent(ver)}`;
      }

      const resp = await fetch(queryUrl, { cache: 'no-store' });
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
        source: data.source || currentSource,
        provider: data.provider || 'Active',
        version: data.version || '',
        serial: data.serial || null,
        softbanned: Boolean(data.softbanned),
        revoked: Boolean(data.revoked),
        sizeBytes: uint8Bytes.length,
      };

      // Populate Hero Card
      metaDeviceId.textContent = metadata.deviceId;

      // Source Tag
      const sourceNameMap = {
        specter: 'Specter',
        integritybox: 'Integrity-Box',
        upstream: 'Custom Upstream'
      };
      metaSourceTag.textContent = sourceNameMap[currentKeybox.source] || currentKeybox.source;

      // Status Tag
      if (currentKeybox.revoked) {
        metaStatusTag.textContent = 'REVOKED';
        metaStatusTag.className = 'm3-status-tag revoked';
      } else if (currentKeybox.softbanned) {
        metaStatusTag.textContent = 'SOFTBANNED';
        metaStatusTag.className = 'm3-status-tag softban';
      } else {
        metaStatusTag.textContent = 'ACTIVE / STRONG';
        metaStatusTag.className = 'm3-status-tag strong';
      }

      // Provider Details
      const provStr = currentKeybox.version ? `${currentKeybox.provider} (${currentKeybox.version})` : currentKeybox.provider;
      metaProviderDetail.textContent = `Source: ${sourceNameMap[currentKeybox.source] || currentKeybox.source} • Provider: ${provStr}`;

      // Specifications
      metaAlgorithms.textContent = metadata.algorithms;
      metaCerts.textContent = metadata.totalCerts;
      metaSize.textContent = `${(currentKeybox.sizeBytes / 1024).toFixed(2)} KB (${currentKeybox.sizeBytes} B)`;
      metaSerial.textContent = currentKeybox.serial || 'Verified in Cert';
      metaHash.textContent = hash;

      // Populate XML preview
      xmlCodeBlock.querySelector('code').textContent = decodedXml;
      const lines = decodedXml.split('\n').length;
      viewerLineCount.textContent = `${lines} lines`;

      resultsSection.classList.remove('hidden');
      showToast(`Keybox verified (${provStr})`);
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

  // Initialize
  setSource(currentSource);
  initSources();
})();
