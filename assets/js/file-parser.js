/* assets/js/file-parser.js
 *
 * Parse dropped CSV / Excel files (WebSelfStorage & U-Haul exports)
 * and push the extracted numbers into the live dashboard via the
 * public helpers exposed by data-loader.js.
 *
 * Requires SheetJS (XLSX) loaded globally.
 * Uses ES5 only — no const/let/arrow functions.
 */
(function () {
  'use strict';

  /* ── helpers ──────────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }

  function lower(s) { return (s || '').toString().toLowerCase().trim(); }

  function toNum(v) {
    if (v == null) return 0;
    var s = v.toString().replace(/[$,%]/g, '').trim();
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function formatCurrency(n) {
    if (n == null) return '$0';
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  /* ── Read a File into an array-of-objects via SheetJS ───────── */
  function readFile(file, cb) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = new Uint8Array(e.target.result);
        var workbook = XLSX.read(data, { type: 'array', cellDates: true });
        var sheetName = workbook.SheetNames[0];
        var sheet = workbook.Sheets[sheetName];
        var rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        cb(null, rows, workbook);
      } catch (err) {
        cb(err, null, null);
      }
    };
    reader.onerror = function () { cb(new Error('File read error'), null, null); };
    reader.readAsArrayBuffer(file);
  }

  /* ── Column-matching utilities ────────────────────────────────── */
  function colMatch(headers, patterns) {
    for (var i = 0; i < headers.length; i++) {
      var h = lower(headers[i]);
      for (var j = 0; j < patterns.length; j++) {
        if (h.indexOf(patterns[j]) !== -1) return headers[i];
      }
    }
    return null;
  }

  /* ── Detect file type ─────────────────────────────────────────── */
  function detectType(headers) {
    var joined = headers.map(lower).join(' ');
    // U-Haul indicators
    if (joined.indexOf('equipment') !== -1 || joined.indexOf('dispatch') !== -1 ||
        joined.indexOf('truck') !== -1 || joined.indexOf('rental') !== -1 ||
        joined.indexOf('pickup') !== -1 || joined.indexOf('contract') !== -1 ||
        joined.indexOf('one way') !== -1 || joined.indexOf('in-town') !== -1) {
      return 'uhaul';
    }
    // WSS indicators
    if (joined.indexOf('tenant') !== -1 || joined.indexOf('unit') !== -1 ||
        joined.indexOf('move') !== -1 || joined.indexOf('occupi') !== -1 ||
        joined.indexOf('delinq') !== -1 || joined.indexOf('balance') !== -1 ||
        joined.indexOf('rent') !== -1 || joined.indexOf('storage') !== -1 ||
        joined.indexOf('size') !== -1 || joined.indexOf('status') !== -1) {
      return 'wss';
    }
    return 'unknown';
  }

  /* ────────────────────────────────────────────────────────────────
   *  WSS PARSER
   *
   *  Expects rows with some combination of:
   *   - Unit / Unit # / Space / Space #
   *   - Size / Dimensions / Type
   *   - Status (Occupied / Vacant / Delinquent / Reserved)
   *   - Tenant / Name / Customer
   *   - Rate / Rent / Monthly Rate / Price
   *   - Balance / Amount Due / Past Due
   *   - Move-In Date / Moved In
   *   - Move-Out Date / Moved Out
   *   - Climate / CC / Climate Controlled
   * ─────────────────────────────────────────────────────────────── */
  function parseWSS(rows) {
    if (!rows || !rows.length) return null;
    var headers = Object.keys(rows[0]);

    var colUnit    = colMatch(headers, ['unit', 'space']);
    var colSize    = colMatch(headers, ['size', 'dimension', 'type', 'width']);
    var colStatus  = colMatch(headers, ['status', 'state']);
    var colRate    = colMatch(headers, ['rate', 'rent', 'price', 'monthly']);
    var colBalance = colMatch(headers, ['balance', 'due', 'past due', 'owed', 'delinq']);
    var colMoveIn  = colMatch(headers, ['move-in', 'move in', 'moved in', 'movein', 'start']);
    var colMoveOut = colMatch(headers, ['move-out', 'move out', 'moved out', 'moveout', 'end', 'vacate']);
    var colClimate = colMatch(headers, ['climate', 'cc', 'controlled']);
    var colTenant  = colMatch(headers, ['tenant', 'name', 'customer', 'renter']);

    var totalUnits = rows.length;
    var occupiedUnits = 0;
    var delinquentBalance = 0;
    var storageRevenue = 0;
    var moveInsMonth = 0;
    var moveOutsMonth = 0;
    var monthlyRentPotential = 0;

    var now = new Date();
    var thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    // Track occupancy by unit type
    var typeMap = {}; // key = "10x10" or "10x10_cc"

    rows.forEach(function (row) {
      var status = lower(row[colStatus] || '');
      var rate = toNum(row[colRate]);
      var balance = toNum(row[colBalance]);
      var sizeRaw = (row[colSize] || '').toString().trim();
      var isClimate = false;
      if (colClimate) {
        var cv = lower(row[colClimate]);
        isClimate = (cv === 'yes' || cv === 'true' || cv === '1' || cv === 'y' || cv === 'climate');
      }

      // Determine if occupied
      var isOccupied = false;
      if (colStatus) {
        isOccupied = (status.indexOf('occup') !== -1 || status.indexOf('rent') !== -1 ||
                      status.indexOf('current') !== -1 || status.indexOf('active') !== -1 ||
                      status.indexOf('delinq') !== -1 || status.indexOf('late') !== -1);
      } else if (colTenant) {
        // If no status column, consider occupied if there's a tenant name
        isOccupied = (row[colTenant] || '').toString().trim().length > 0;
      }

      if (isOccupied) {
        occupiedUnits++;
        storageRevenue += rate;
      }

      // Track potential rent for all units
      if (rate > 0) {
        monthlyRentPotential += rate;
      }

      // Delinquent
      if (balance > 0) {
        delinquentBalance += balance;
      } else if (status.indexOf('delinq') !== -1 || status.indexOf('late') !== -1) {
        delinquentBalance += rate; // estimate
      }

      // Move-in / move-out this month
      if (colMoveIn) {
        var mid = (row[colMoveIn] || '').toString().slice(0, 7);
        if (mid === thisMonth) moveInsMonth++;
      }
      if (colMoveOut) {
        var mod = (row[colMoveOut] || '').toString().slice(0, 7);
        if (mod === thisMonth) moveOutsMonth++;
      }

      // Occupancy by type
      var typeKey = sizeRaw || 'Unknown';
      var mapKey = typeKey + (isClimate ? '_cc' : '');
      if (!typeMap[mapKey]) {
        typeMap[mapKey] = { type: typeKey, climate: isClimate, occupied: 0, total: 0 };
      }
      typeMap[mapKey].total++;
      if (isOccupied) typeMap[mapKey].occupied++;
    });

    var occupancyPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 1000) / 10 : 0;

    var occupancyByType = [];
    Object.keys(typeMap).forEach(function (k) { occupancyByType.push(typeMap[k]); });

    return {
      kpis: {
        occupancy_pct: occupancyPct,
        occupied_units: occupiedUnits,
        total_units: totalUnits,
        move_ins_month: moveInsMonth,
        move_outs_month: moveOutsMonth,
        storage_revenue_mtd: storageRevenue,
        delinquent_balance: delinquentBalance,
        monthly_rent_potential: monthlyRentPotential
      },
      occupancy_by_unit_type: occupancyByType
    };
  }

  /* ────────────────────────────────────────────────────────────────
   *  U-HAUL PARSER
   *
   *  Expects rows with some combination of:
   *   - Equipment / Type / Vehicle / Truck
   *   - Revenue / Total / Amount / Charge
   *   - Date / Pickup Date / Dispatch Date / Return Date
   *   - Status (Dispatched / Returned / Open / Closed)
   *   - Contract / Order / Confirmation
   * ─────────────────────────────────────────────────────────────── */
  function parseUHaul(rows) {
    if (!rows || !rows.length) return null;
    var headers = Object.keys(rows[0]);

    var colEquip   = colMatch(headers, ['equipment', 'type', 'vehicle', 'truck', 'size', 'description']);
    var colRevenue = colMatch(headers, ['revenue', 'total', 'amount', 'charge', 'gross', 'income', 'price']);
    var colDate    = colMatch(headers, ['date', 'pickup', 'dispatch', 'return', 'created']);
    var colStatus  = colMatch(headers, ['status', 'state']);

    var totalRentals = 0;
    var totalReturns = 0;
    var totalRevenue = 0;
    var equipmentMix = {};

    var now = new Date();
    var thisMonth = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

    rows.forEach(function (row) {
      var rev = toNum(row[colRevenue]);
      var equip = (row[colEquip] || 'Unknown').toString().trim();
      var status = lower(row[colStatus] || '');

      // Determine if this month (if date column exists)
      var inMonth = true;
      if (colDate) {
        var dateVal = (row[colDate] || '').toString();
        // Handle Date objects from SheetJS
        if (row[colDate] instanceof Date) {
          dateVal = row[colDate].toISOString();
        }
        var dateMonth = dateVal.slice(0, 7);
        inMonth = (dateMonth === thisMonth);
      }

      if (!inMonth) return;

      totalRentals++;
      totalRevenue += rev;

      if (status.indexOf('return') !== -1 || status.indexOf('closed') !== -1 ||
          status.indexOf('complete') !== -1) {
        totalReturns++;
      }

      // Equipment mix
      // Normalize equipment name
      var eqNorm = equip;
      var eqLow = lower(equip);
      if (eqLow.indexOf('trailer') !== -1 || eqLow.indexOf('trl') !== -1) eqNorm = 'Trailers';
      else if (eqLow.indexOf('auto') !== -1 || eqLow.indexOf('car') !== -1 || eqLow.indexOf('transport') !== -1) eqNorm = 'Auto Transports';
      else if (eqLow.indexOf('truck') !== -1 || eqLow.indexOf('ft') !== -1 || eqLow.indexOf('\'') !== -1 || eqLow.match(/\d+\s*f/)) eqNorm = 'Trucks';

      if (!equipmentMix[eqNorm]) {
        equipmentMix[eqNorm] = { type: eqNorm, count: 0, revenue_mtd: 0 };
      }
      equipmentMix[eqNorm].count++;
      equipmentMix[eqNorm].revenue_mtd += rev;
    });

    var equipArr = [];
    Object.keys(equipmentMix).forEach(function (k) { equipArr.push(equipmentMix[k]); });

    return {
      uhaul_revenue_mtd: Math.round(totalRevenue),
      total_rentals: totalRentals,
      total_returns: totalReturns,
      uhaul_equipment_mix: equipArr
    };
  }

  /* ── Apply parsed data to the live dashboard ──────────────────── */
  function applyWSS(parsed) {
    if (!parsed || !parsed.kpis) return;
    var k = parsed.kpis;

    // Update KPI values
    if ($('kpi-occupancy')) $('kpi-occupancy').textContent = k.occupancy_pct.toFixed(1) + '%';
    if ($('kpi-occupancy-bar')) $('kpi-occupancy-bar').style.width = k.occupancy_pct + '%';
    if ($('kpi-units')) $('kpi-units').textContent = k.occupied_units + ' / ' + k.total_units;
    if ($('kpi-units-bar')) $('kpi-units-bar').style.width = k.occupancy_pct + '%';
    if ($('kpi-moveins')) $('kpi-moveins').textContent = k.move_ins_month;
    if ($('kpi-moveouts')) $('kpi-moveouts').textContent = k.move_outs_month;
    if ($('kpi-storage-rev')) $('kpi-storage-rev').textContent = formatCurrency(k.storage_revenue_mtd);
    if ($('kpi-delinquent')) $('kpi-delinquent').textContent = formatCurrency(k.delinquent_balance);
    if ($('kpi-rent')) $('kpi-rent').textContent = formatCurrency(k.monthly_rent_potential);

    // Update MTD total (storage + existing U-Haul)
    var existingUhaul = 0;
    var uhaulEl = $('kpi-uhaul-rev');
    if (uhaulEl) {
      existingUhaul = toNum(uhaulEl.textContent);
    }
    var total = k.storage_revenue_mtd + existingUhaul;
    if ($('mtd-total')) $('mtd-total').textContent = formatCurrency(total);
    if ($('mtd-breakdown')) {
      $('mtd-breakdown').textContent = 'Storage ' + formatCurrency(k.storage_revenue_mtd) +
        ' \u00b7 U-Haul ' + formatCurrency(existingUhaul) +
        ' \u00b7 Potential Rent ' + formatCurrency(k.monthly_rent_potential);
    }

    // Update occupancy by unit type chart
    if (parsed.occupancy_by_unit_type && parsed.occupancy_by_unit_type.length && window.Chart) {
      var ctx = $('chart-unit-types');
      if (ctx) {
        var types = parsed.occupancy_by_unit_type;
        var existing = Chart.getChart(ctx);
        if (existing) existing.destroy();
        new Chart(ctx, {
          type: 'bar',
          data: {
            labels: types.map(function (t) { return t.type + (t.climate ? ' (CC)' : ''); }),
            datasets: [{
              label: 'Occupancy %',
              data: types.map(function (t) {
                if (!t.total) return 0;
                return Math.round((t.occupied / t.total) * 100);
              }),
              backgroundColor: 'rgba(34,197,94,0.9)'
            }]
          },
          options: {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { color: '#64748b', font: { size: 10 }, callback: function (v) { return v + '%'; } }, grid: { color: 'rgba(15,23,42,0.7)' } },
              y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } }
            }
          }
        });
      }
    }

    // Update occupancy trend chart — append today's data point
    var occCtx = $('chart-occupancy');
    if (occCtx && window.Chart) {
      var occChart = Chart.getChart(occCtx);
      if (occChart) {
        var todayLabel = today().slice(5);
        var labels = occChart.data.labels;
        // Replace last label or append
        if (labels[labels.length - 1] === todayLabel) {
          occChart.data.datasets[0].data[labels.length - 1] = k.occupancy_pct;
        } else {
          labels.push(todayLabel);
          occChart.data.datasets[0].data.push(k.occupancy_pct);
        }
        occChart.update();
      }
    }

    // Flash the KPI cards briefly to indicate update
    flashElements('.kpi-card');
  }

  function applyUHaul(parsed) {
    if (!parsed) return;

    // Update U-Haul revenue KPI
    if ($('kpi-uhaul-rev')) $('kpi-uhaul-rev').textContent = formatCurrency(parsed.uhaul_revenue_mtd);

    // Update MTD total (existing storage + new U-Haul)
    var existingStorage = 0;
    var storageEl = $('kpi-storage-rev');
    if (storageEl) {
      existingStorage = toNum(storageEl.textContent);
    }
    var total = existingStorage + parsed.uhaul_revenue_mtd;
    if ($('mtd-total')) $('mtd-total').textContent = formatCurrency(total);
    if ($('mtd-breakdown')) {
      var rent = 0;
      var rentEl = $('kpi-rent');
      if (rentEl) rent = toNum(rentEl.textContent);
      $('mtd-breakdown').textContent = 'Storage ' + formatCurrency(existingStorage) +
        ' \u00b7 U-Haul ' + formatCurrency(parsed.uhaul_revenue_mtd) +
        ' \u00b7 Potential Rent ' + formatCurrency(rent);
    }

    // Update U-Haul equipment mix chart
    if (parsed.uhaul_equipment_mix && parsed.uhaul_equipment_mix.length && window.Chart) {
      var ctx = $('chart-uhaul');
      if (ctx) {
        var eq = parsed.uhaul_equipment_mix;
        var existing = Chart.getChart(ctx);
        if (existing) existing.destroy();
        new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: eq.map(function (p) { return p.type; }),
            datasets: [{
              data: eq.map(function (p) { return p.revenue_mtd || p.count; }),
              backgroundColor: ['#22c55e', '#22d3ee', '#facc15', '#a855f7']
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: true, labels: { color: '#9ca3af', font: { size: 10 } } } },
            cutout: '60%'
          }
        });
      }
    }

    // Flash the KPI cards briefly to indicate update
    flashElements('.kpi-card');
  }

  /* ── Visual feedback: flash updated elements ────────────────── */
  function flashElements(selector) {
    var els = document.querySelectorAll(selector);
    els.forEach(function (el) {
      el.style.transition = 'box-shadow 0.3s ease';
      el.style.boxShadow = '0 0 0 2px rgba(0,208,219,0.5), 0 0 16px rgba(0,208,219,0.2)';
      setTimeout(function () {
        el.style.boxShadow = '';
      }, 1500);
    });
  }

  /* ── Wire up the drop zones ─────────────────────────────────── */
  function setupFileHandler(dropId, inputId, statusId, expectedType) {
    var drop = $(dropId);
    var input = $(inputId);
    var status = $(statusId);
    if (!drop || !input || !status) return;

    function highlight() {
      drop.style.borderColor = 'var(--accent)';
      drop.style.background = 'var(--accent-dim)';
    }
    function unhighlight() {
      drop.style.borderColor = 'var(--border-strong)';
      drop.style.background = 'var(--bg-raised)';
    }

    function processFile(file) {
      if (!file) return;
      var ext = file.name.split('.').pop().toLowerCase();
      if (['csv', 'xlsx', 'xls'].indexOf(ext) === -1) {
        status.style.color = 'var(--red)';
        status.textContent = 'Invalid file type. Use CSV or Excel.';
        return;
      }

      status.style.color = 'var(--accent)';
      status.textContent = '\u23F3 Parsing ' + file.name + '...';

      readFile(file, function (err, rows, workbook) {
        if (err || !rows || !rows.length) {
          status.style.color = 'var(--red)';
          status.textContent = '\u274C Error parsing file: ' + (err ? err.message : 'No data found');
          return;
        }

        var headers = Object.keys(rows[0]);
        var detectedType = detectType(headers);

        // If dropped in wrong zone, warn but still parse
        if (expectedType && detectedType !== 'unknown' && detectedType !== expectedType) {
          status.style.color = 'var(--yellow)';
          status.textContent = '\u26A0 This looks like a ' + detectedType.toUpperCase() +
            ' file. Processing anyway...';
        }

        var parseType = (detectedType !== 'unknown') ? detectedType : expectedType;

        if (parseType === 'wss') {
          var wssData = parseWSS(rows);
          if (wssData) {
            applyWSS(wssData);
            status.style.color = 'var(--green)';
            status.textContent = '\u2705 ' + file.name + ' \u2014 ' +
              rows.length + ' units loaded. Occupancy: ' +
              wssData.kpis.occupancy_pct.toFixed(1) + '% (' +
              wssData.kpis.occupied_units + '/' + wssData.kpis.total_units + ')';
          } else {
            status.style.color = 'var(--red)';
            status.textContent = '\u274C Could not extract data from this file.';
          }
        } else if (parseType === 'uhaul') {
          var uhaulData = parseUHaul(rows);
          if (uhaulData) {
            applyUHaul(uhaulData);
            status.style.color = 'var(--green)';
            status.textContent = '\u2705 ' + file.name + ' \u2014 ' +
              uhaulData.total_rentals + ' rentals, ' +
              formatCurrency(uhaulData.uhaul_revenue_mtd) + ' revenue';
          } else {
            status.style.color = 'var(--red)';
            status.textContent = '\u274C Could not extract data from this file.';
          }
        } else {
          status.style.color = 'var(--yellow)';
          status.textContent = '\u26A0 Could not detect file type. Check column headers.';
        }
      });
    }

    // Drag events
    drop.addEventListener('dragover', function (e) { e.preventDefault(); highlight(); });
    drop.addEventListener('dragleave', function (e) { e.preventDefault(); unhighlight(); });
    drop.addEventListener('drop', function (e) {
      e.preventDefault();
      unhighlight();
      if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
    });

    // File input change
    input.addEventListener('change', function () {
      if (input.files.length) processFile(input.files[0]);
    });

    // Click on drop zone opens file picker
    drop.addEventListener('click', function (e) {
      // Don't trigger if clicking the browse button (it has its own handler)
      if (e.target.tagName === 'BUTTON') return;
      input.click();
    });
  }

  /* ── Init on DOM ready ─────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    // Bind to the inline HTML upload zones
    setupFileHandler('drop-uhaul', 'file-uhaul', 'uhaul-upload-status', 'uhaul');
    setupFileHandler('drop-wss', 'file-wss', 'wss-upload-status', 'wss');
  });

})();
