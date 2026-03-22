/* Upload sections - injects drag-and-drop file upload areas at the bottom of the dashboard */
(function() {
  'use strict';

  function injectUploads() {
    // Don't inject if already present
    if (document.getElementById('section-uploads-injected')) return;

    // Find the footer or last major section to insert before
    var footer = document.querySelector('footer');
    var target = footer ? footer : document.body;

    var section = document.createElement('section');
    section.id = 'section-uploads-injected';
    section.style.cssText = 'max-width:1100px;margin:2rem auto;padding:0 1.5rem;';
    section.innerHTML = '<div style="background:var(--surface,#111d30);border:1px solid var(--border,rgba(148,163,184,0.10));border-radius:1.25rem;padding:1.25rem;">' +
      '<div style="margin-bottom:1rem;"><div style="font-family:var(--font-display,system-ui);font-weight:700;font-size:1rem;color:var(--text,#dde7f5);">Data Uploads</div>' +
      '<div style="font-size:0.75rem;color:var(--text-muted,#7a8fa8);margin-top:2px;">Drop CSV or Excel files to update dashboard data</div></div>' +
      '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:1rem;">' +
      /* U-Haul */
      '<div id="drop-uhaul-live" style="border:2px dashed rgba(148,163,184,0.18);border-radius:1rem;padding:2rem 1rem;text-align:center;cursor:pointer;transition:border-color 0.2s,background 0.2s;background:var(--bg-raised,#0d1525);">' +
      '<div style="font-size:2rem;margin-bottom:0.5rem;">\uD83D\uDE9B</div>' +
      '<div style="font-family:var(--font-display,system-ui);font-weight:600;font-size:0.875rem;color:var(--text,#dde7f5);margin-bottom:4px;">U-Haul Data</div>' +
      '<div style="font-size:0.6875rem;color:var(--text-muted,#7a8fa8);margin-bottom:0.75rem;">Drag &amp; drop CSV/Excel here or click to browse</div>' +
      '<input type="file" id="file-uhaul-live" accept=".csv,.xlsx,.xls" style="display:none;">' +
      '<button id="btn-uhaul-browse" style="padding:6px 16px;border-radius:9999px;border:1px solid rgba(148,163,184,0.18);background:var(--surface-2,#162237);color:var(--text-muted,#7a8fa8);font-size:0.6875rem;cursor:pointer;">Browse Files</button>' +
      '<div id="uhaul-upload-status-live" style="margin-top:0.5rem;font-size:0.6875rem;color:#22c55e;min-height:16px;"></div>' +
      '</div>' +
      /* WebSelfStorage */
      '<div id="drop-wss-live" style="border:2px dashed rgba(148,163,184,0.18);border-radius:1rem;padding:2rem 1rem;text-align:center;cursor:pointer;transition:border-color 0.2s,background 0.2s;background:var(--bg-raised,#0d1525);">' +
      '<div style="font-size:2rem;margin-bottom:0.5rem;">\uD83C\uDFE2</div>' +
      '<div style="font-family:var(--font-display,system-ui);font-weight:600;font-size:0.875rem;color:var(--text,#dde7f5);margin-bottom:4px;">WebSelfStorage Data</div>' +
      '<div style="font-size:0.6875rem;color:var(--text-muted,#7a8fa8);margin-bottom:0.75rem;">Drag &amp; drop CSV/Excel here or click to browse</div>' +
      '<input type="file" id="file-wss-live" accept=".csv,.xlsx,.xls" style="display:none;">' +
      '<button id="btn-wss-browse" style="padding:6px 16px;border-radius:9999px;border:1px solid rgba(148,163,184,0.18);background:var(--surface-2,#162237);color:var(--text-muted,#7a8fa8);font-size:0.6875rem;cursor:pointer;">Browse Files</button>' +
      '<div id="wss-upload-status-live" style="margin-top:0.5rem;font-size:0.6875rem;color:#22c55e;min-height:16px;"></div>' +
      '</div>' +
      '</div></div>';

    if (footer) {
      footer.parentNode.insertBefore(section, footer);
    } else {
      target.appendChild(section);
    }

    // Wire up browse buttons
    var btnU = document.getElementById('btn-uhaul-browse');
    var btnW = document.getElementById('btn-wss-browse');
    if (btnU) btnU.addEventListener('click', function() { document.getElementById('file-uhaul-live').click(); });
    if (btnW) btnW.addEventListener('click', function() { document.getElementById('file-wss-live').click(); });

    // Drag-and-drop handlers
    function setupDrop(dropId, inputId, statusId) {
      var drop = document.getElementById(dropId);
      var input = document.getElementById(inputId);
      var status = document.getElementById(statusId);
      if (!drop || !input || !status) return;

      function highlight() { drop.style.borderColor = '#00d0db'; drop.style.background = 'rgba(0,208,219,0.10)'; }
      function unhighlight() { drop.style.borderColor = 'rgba(148,163,184,0.18)'; drop.style.background = 'var(--bg-raised,#0d1525)'; }
      function handleFile(file) {
        if (!file) return;
        var ext = file.name.split('.').pop().toLowerCase();
        if (['csv','xlsx','xls'].indexOf(ext) === -1) {
          status.style.color = '#f87171';
          status.textContent = 'Invalid file type. Use CSV or Excel.';
          return;
        }
        status.style.color = '#22c55e';
        status.textContent = '\u2705 ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB) ready';
      }
      drop.addEventListener('dragover', function(e) { e.preventDefault(); highlight(); });
      drop.addEventListener('dragleave', function(e) { e.preventDefault(); unhighlight(); });
      drop.addEventListener('drop', function(e) { e.preventDefault(); unhighlight(); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
      input.addEventListener('change', function() { if (input.files.length) handleFile(input.files[0]); });

      // Hover effects
      drop.addEventListener('mouseenter', function() { drop.style.borderColor = '#00d0db'; drop.style.background = 'rgba(0,208,219,0.06)'; });
      drop.addEventListener('mouseleave', function() { unhighlight(); });
    }

    setupDrop('drop-uhaul-live', 'file-uhaul-live', 'uhaul-upload-status-live');
    setupDrop('drop-wss-live', 'file-wss-live', 'wss-upload-status-live');
  }

  // Wait for dashboard to fully render, then inject
  if (document.readyState === 'complete') {
    setTimeout(injectUploads, 500);
  } else {
    window.addEventListener('load', function() {
      setTimeout(injectUploads, 500);
    });
  }

  // Also observe for dynamic content changes (password gate -> dashboard)
  var observer = new MutationObserver(function() {
    if (!document.getElementById('section-uploads-injected')) {
      setTimeout(injectUploads, 300);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
