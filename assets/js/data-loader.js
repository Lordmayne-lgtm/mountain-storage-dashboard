/* assets/js/data-loader.js
 *
 * Fetch JSON data and initialize KPIs, charts, Leaflet map,
 * competition cards, reviews, and weather.
 */
(function () {
  'use strict';

  var metricsUrl = 'data/metrics.json';
  var reviewsUrl = 'data/reviews.json';
  var competitorsUrl = 'data/competitors.json';

  var charts = {};
  var mapInstance = null;
  var mapMarkers = [];
  var _cachedMetrics = null;
  var _cachedReviews = null;
  var _cachedCompetitors = null;

  function formatCurrency(n) {
    if (n == null) return '$0';
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function $(id) {
    return document.getElementById(id);
  }

  function initScrollSpy() {
    var links = Array.from(document.querySelectorAll('.section-nav-link'));
    if (!links.length) return;
    links.forEach(function (link) {
      link.addEventListener('click', function () {
        var targetId = link.getAttribute('data-target');
        var section = document.getElementById(targetId);
        if (!section) return;
        window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY - 76, behavior: 'smooth' });
      });
    });
    var sections = links.map(function (link) { return document.getElementById(link.getAttribute('data-target')); }).filter(Boolean);
    window.addEventListener('scroll', function () {
      var scrollY = window.scrollY;
      var activeId = null;
      sections.forEach(function (sec) { var top = sec.offsetTop - 120; if (scrollY >= top) activeId = sec.id; });
      links.forEach(function (link) {
        if (link.getAttribute('data-target') === activeId) link.classList.add('active');
        else link.classList.remove('active');
      });
    });
  }

  function initKpis(metrics) {
    if (!metrics || !metrics.kpis) return;
    var k = metrics.kpis;
    if ($('mtd-total')) $('mtd-total').textContent = formatCurrency(k.mtd_total_revenue || k.mtd_total || 3715);
    if ($('mtd-breakdown')) {
      $('mtd-breakdown').textContent = 'Storage ' + formatCurrency(k.storage_revenue_mtd) + ' \u00b7 U-Haul ' + formatCurrency(k.uhaul_revenue_mtd || 828) + ' \u00b7 Potential Rent ' + formatCurrency(k.monthly_rent_potential);
    }
    if ($('kpi-occupancy')) $('kpi-occupancy').textContent = (k.occupancy_pct || 0).toFixed(1) + '%';
    if ($('kpi-occupancy-bar')) $('kpi-occupancy-bar').style.width = (k.occupancy_pct || 0) + '%';
    if ($('kpi-units')) $('kpi-units').textContent = (k.occupied_units || 0) + ' / ' + (k.total_units || 0);
    if ($('kpi-units-bar')) $('kpi-units-bar').style.width = (k.occupancy_pct || 0) + '%';
    if ($('kpi-moveins')) $('kpi-moveins').textContent = k.move_ins_month || 0;
    if ($('kpi-moveouts')) $('kpi-moveouts').textContent = k.move_outs_month || 0;
    if ($('kpi-storage-rev')) $('kpi-storage-rev').textContent = formatCurrency(k.storage_revenue_mtd);
    if ($('kpi-uhaul-rev')) $('kpi-uhaul-rev').textContent = formatCurrency(k.uhaul_revenue_mtd || 828);
    if ($('kpi-delinquent')) $('kpi-delinquent').textContent = formatCurrency(k.delinquent_balance || 0);
    if ($('kpi-rent')) $('kpi-rent').textContent = formatCurrency(k.monthly_rent_potential || 5765);
  }

  function buildChart(id, config) {
    var ctx = document.getElementById(id);
    if (!ctx || !(window.Chart)) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(ctx, config);
  }

  function initCharts(metrics, competitors, reviews) {
    if (!metrics) return;
    var occ = metrics.occupancy_trend || [];
    buildChart('chart-occupancy', {
      type: 'line',
      data: { labels: occ.map(function (p) { return p.date.slice(5); }), datasets: [{ label: 'Occupancy %', data: occ.map(function (p) { return p.occupancy_pct; }), borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,0.25)', tension: 0.35, fill: true, pointRadius: 3, pointBackgroundColor: '#22d3ee' }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: '#64748b', font: { size: 10 }, callback: function (v) { return v + '%'; } }, grid: { color: 'rgba(15,23,42,0.7)' } } } }
    });

    var moves = metrics.move_activity_weekly || [];
    buildChart('chart-moves', {
      type: 'bar',
      data: { labels: moves.map(function (p) { return p.week_of.slice(5); }), datasets: [{ label: 'Move-Ins', data: moves.map(function (p) { return p.move_ins; }), backgroundColor: 'rgba(34,197,94,0.9)' }, { label: 'Move-Outs', data: moves.map(function (p) { return p.move_outs; }), backgroundColor: 'rgba(248,113,113,0.9)' }] },
      options: { responsive: true, plugins: { legend: { display: true, labels: { color: '#9ca3af', font: { size: 10 } } } }, scales: { x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(15,23,42,0.7)' } } } }
    });

    var eq = metrics.uhaul_equipment_mix || [];
    buildChart('chart-uhaul', {
      type: 'doughnut',
      data: { labels: eq.map(function (p) { return p.type; }), datasets: [{ data: eq.map(function (p) { return p.revenue_mtd || p.count; }), backgroundColor: ['#22c55e', '#22d3ee', '#facc15', '#a855f7'] }] },
      options: { responsive: true, plugins: { legend: { display: true, labels: { color: '#9ca3af', font: { size: 10 } } } }, cutout: '60%' }
    });

    var turnovers = metrics.weekly_turnovers || [];
    buildChart('chart-turnovers', {
      type: 'bar',
      data: { labels: turnovers.map(function (p) { return p.week_of.slice(5); }), datasets: [{ label: 'Units Turned', data: turnovers.map(function (p) { return p.units_turned; }), backgroundColor: 'rgba(56,189,248,0.9)' }] },
      options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(15,23,42,0.7)' } } } }
    });

    var weekly = metrics.weekly_revenue || [];
    buildChart('chart-weekly-revenue', {
      type: 'bar',
      data: { labels: weekly.map(function (p) { return p.week_of.slice(5); }), datasets: [{ label: 'Storage', data: weekly.map(function (p) { return p.storage; }), backgroundColor: 'rgba(34,197,94,0.9)' }, { label: 'U-Haul', data: weekly.map(function (p) { return p.uhaul; }), backgroundColor: 'rgba(34,211,238,0.9)' }] },
      options: { responsive: true, plugins: { legend: { display: true, labels: { color: '#9ca3af', font: { size: 10 } } } }, scales: { x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(15,23,42,0.7)' } } } }
    });

    var types = metrics.occupancy_by_unit_type || [];
    buildChart('chart-unit-types', {
      type: 'bar',
      data: { labels: types.map(function (t) { return t.type + (t.climate ? ' (CC)' : ''); }), datasets: [{ label: 'Occupancy %', data: types.map(function (t) { if (!t.total) return 0; return Math.round((t.occupied / t.total) * 100); }), backgroundColor: 'rgba(34,197,94,0.9)' }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b', font: { size: 10 }, callback: function (v) { return v + '%'; } }, grid: { color: 'rgba(15,23,42,0.7)' } }, y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } } } }
    });

    if (competitors && competitors.comparisons) {
      var nc = competitors.comparisons.non_climate_10x10 || {};
      var ncFacilities = nc.facilities || [];
      buildChart('chart-pricing-nc', {
        type: 'bar',
        data: { labels: ncFacilities.map(function (f) { return f.name; }), datasets: [{ label: '10x10 NC', data: ncFacilities.map(function (f) { return f.price || 0; }), backgroundColor: ncFacilities.map(function (f) { return f.name === 'Mountain Storage' ? 'rgba(34,197,94,0.95)' : 'rgba(34,211,238,0.8)'; }) }] },
        options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: '#64748b', font: { size: 10 }, callback: function (v) { return '$' + v; } }, grid: { color: 'rgba(15,23,42,0.7)' } } } }
      });
      var cc = competitors.comparisons.climate_pricing || {};
      var ccExamples = cc.examples || [];
      buildChart('chart-pricing-cc', {
        type: 'bar',
        data: { labels: ccExamples.map(function (e) { return e.name + ' ' + e.size; }), datasets: [{ label: 'Climate', data: ccExamples.map(function (e) { return e.price || 0; }), backgroundColor: ccExamples.map(function (e) { return e.name === 'Mountain Storage' ? 'rgba(34,197,94,0.95)' : 'rgba(56,189,248,0.85)'; }) }] },
        options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: '#64748b', font: { size: 10 }, callback: function (v) { return '$' + v; } }, grid: { color: 'rgba(15,23,42,0.7)' } } } }
      });
    }

    if (reviews && reviews.facilities) {
      var facilities = reviews.facilities;
      buildChart('chart-google-reviews', {
        type: 'bar',
        data: { labels: facilities.map(function (f) { return f.name; }), datasets: [{ label: 'Rating', data: facilities.map(function (f) { return f.google_rating || 0; }), backgroundColor: facilities.map(function (f) { return f.name === 'Mountain Storage' ? 'rgba(34,197,94,0.95)' : 'rgba(34,211,238,0.85)'; }) }] },
        options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(15,23,42,0.7)' }, min: 3.5, max: 5.1 } } }
      });
    }

    if (competitors && competitors.facilities) {
      var facilities2 = competitors.facilities;
      buildChart('chart-office-hours', {
        type: 'bar',
        data: { labels: facilities2.map(function (f) { return f.name; }), datasets: [{ label: 'Office Hours / Week', data: facilities2.map(function (f) { return f.weekly_office_hours || 0; }), backgroundColor: facilities2.map(function (f) { return f.name === 'Mountain Storage' ? 'rgba(34,197,94,0.95)' : 'rgba(59,130,246,0.85)'; }) }] },
        options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(15,23,42,0.7)' } } } }
      });
    }
  }

  function initMap(competitors) {
    if (!(window.L) || !competitors || !competitors.facilities) return;
    var mapEl = document.getElementById('competition-map');
    if (!mapEl) return;
    if (mapInstance) { mapInstance.remove(); mapInstance = null; mapMarkers = []; }
    mapInstance = L.map('competition-map', { zoomControl: false }).setView([34.50, -93.05], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '\u00a9 OpenStreetMap contributors' }).addTo(mapInstance);
    var youIcon = L.divIcon({ className: 'custom-marker-you', html: '<div style="background:#22c55e;color:#fff;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap;">\u2605 YOU</div>', iconSize: [40, 20], iconAnchor: [20, 10] });
    var compIcon = L.divIcon({ className: 'custom-marker-comp', html: '<div style="width:12px;height:12px;border-radius:50%;background:#22d3ee;border:2px solid #fff;"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
    competitors.facilities.forEach(function (f, idx) {
      if (typeof f.lat !== 'number' || typeof f.lng !== 'number') return;
      var isYou = f.role === 'you';
      var marker = L.marker([f.lat, f.lng], { icon: isYou ? youIcon : compIcon }).addTo(mapInstance);
      marker.bindPopup('<b>' + f.name + '</b><br>' + (f.address || ''));
      marker.on('click', function () { focusCard(idx); });
      mapMarkers.push(marker);
    });
    setTimeout(function () { mapInstance.invalidateSize(); }, 300);
  }

  function focusMarker(index) {
    if (!mapInstance || !mapMarkers[index]) return;
    var marker = mapMarkers[index];
    mapInstance.setView(marker.getLatLng(), 13, { animate: true });
    marker.openPopup();
  }

  function focusCard(index) {
    var cards = Array.from(document.querySelectorAll('.competition-card'));
    cards.forEach(function (card, idx) {
      if (idx === index) card.classList.add('active');
      else card.classList.remove('active');
    });
    focusMarker(index);
  }

  function initCompetitionCards(competitors) {
    var wrap = $('competition-cards');
    if (!wrap || !competitors || !competitors.facilities) return;
    wrap.innerHTML = '';
    competitors.facilities.forEach(function (f, idx) {
      var card = document.createElement('div');
      card.className = 'competition-card' + (f.role === 'you' ? ' you active' : '');
      card.setAttribute('data-index', idx.toString());
      var priceLine = '';
      if (f.unit_sizes && f.unit_sizes.length) {
        priceLine = f.unit_sizes.map(function (u) {
          return u.size + (u.climate ? 'cc' : '') + ' ' + (u.price != null ? ('$' + u.price) : '\u2014') + (u.billing === 'week' ? '/wk' : '/mo');
        }).slice(0, 5).join(', ');
      }
      var promos = (f.promos || []).join(' \u00b7 ');
      var ratingText = '';
      if (f.google_rating) ratingText = f.google_rating.toFixed(1) + '\u2605 (' + (f.google_review_count || 0) + ')';
      card.innerHTML = '<div class="competition-name-row">' + f.name + (f.role === 'you' ? ' <span class="pill-you">\u2605 YOU</span>' : '') + '</div>' +
        '<div class="competition-line">' + (f.distance_mi != null ? f.distance_mi.toFixed(1) + 'mi \u00b7 ' : '') + (f.address || '') + '</div>' +
        '<div class="competition-line">' + (f.gate_hours ? 'Gate ' + f.gate_hours + ' \u00b7 ' : '') + (f.office_hours ? 'Office ' + f.office_hours : '') + '</div>' +
        '<div class="competition-line">' + (ratingText ? 'Google ' + ratingText : '') + '</div>' +
        '<div>' + (priceLine ? '<div class="competition-pricing">' + priceLine + '</div>' : '') + (promos ? '<div class="competition-promos">' + promos + '</div>' : '') + '</div>';
      card.addEventListener('click', function () { focusCard(idx); });
      wrap.appendChild(card);
    });
  }

  function initReviewsTabs(reviewsData) {
    var container = $('reviews-list');
    if (!container || !reviewsData || !reviewsData.facilities) return;
    function buildReviewCards(filter) {
      container.innerHTML = '';
      reviewsData.facilities.forEach(function (facility) {
        var list = [];
        if (filter === 'google') list = facility.google_reviews || [];
        else if (filter === 'uhaul' && facility.uhaul_reviews) list = facility.uhaul_reviews;
        else list = (facility.google_reviews || []).concat(facility.uhaul_reviews || []);
        list.forEach(function (rev) {
          if (filter === '5' && rev.rating !== 5) return;
          var card = document.createElement('div');
          card.className = 'review-card';
          card.innerHTML = '<div class="review-header"><span class="review-name">' + (rev.author || 'Customer') + '</span><span class="review-stars">' + '\u2605'.repeat(rev.rating || 5) + '</span></div>' +
            '<div style="font-size:10px;color:#6b7280;margin-bottom:4px;">' + (facility.name || '') + (rev.date ? ' \u00b7 ' + rev.date : '') + '</div>' +
            '<div>' + (rev.text || '') + '</div>';
          container.appendChild(card);
        });
      });
      if (!container.children.length) {
        var empty = document.createElement('div');
        empty.className = 'review-card';
        empty.textContent = 'Reviews will appear here as they are fetched from Google and U-Haul.';
        container.appendChild(empty);
      }
    }
    buildReviewCards('all');
    var tabs = Array.from(document.querySelectorAll('.tab-btn'));
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var filter = tab.getAttribute('data-review-filter');
        buildReviewCards(filter || 'all');
      });
    });
  }

  function initWeather(metrics) {
    if (!metrics || !metrics.weather) return;
    var w = metrics.weather;
    if ($('weather-temp')) $('weather-temp').textContent = (w.current_temp_f || 64) + '\u00b0F \u00b7 ' + (w.current_conditions || 'Partly Cloudy');
    if ($('weather-meta')) $('weather-meta').textContent = 'Feels like ' + (w.feels_like_f || w.current_temp_f || 64) + '\u00b0 \u00b7 High ' + (w.high_f || 68) + '\u00b0 / Low ' + (w.low_f || 51) + '\u00b0';
    var grid = $('weather-grid');
    if (grid) {
      grid.innerHTML = '';
      var items = [
        { label: 'Wind', value: (w.wind_mph || 6) + ' mph' },
        { label: 'Humidity', value: (w.humidity_pct || 58) + '%' },
        { label: 'Rain Chance', value: (w.rain_chance_pct || 20) + '%' },
        { label: 'Location', value: w.location || 'Hot Springs, AR' },
        { label: 'As of', value: metrics.as_of || '' }
      ];
      items.forEach(function (it) {
        var div = document.createElement('div');
        div.className = 'weather-item';
        div.innerHTML = '<div style="color:#6b7280;">' + it.label + '</div><div>' + it.value + '</div>';
        grid.appendChild(div);
      });
    }
    var forecastEl = $('weather-forecast');
    if (forecastEl) {
      forecastEl.innerHTML = '';
      (w.forecast || []).forEach(function (d) {
        var span = document.createElement('div');
        span.innerHTML = '<div>' + (d.day || '') + '</div><div style="color:#6b7280;">' + (d.conditions || '') + '</div><div>' + (d.high_f || '') + '\u00b0 / ' + (d.low_f || '') + '\u00b0</div>';
        forecastEl.appendChild(span);
      });
    }
    var alerts = metrics.rental_alerts || [];
    var alertGrid = $('alert-grid');
    if (alertGrid) {
      alertGrid.innerHTML = '';
      alerts.forEach(function (a) {
        var div = document.createElement('div');
        div.className = 'alert ' + (a.severity || 'info');
        div.innerHTML = '<div class="alert-title">' + a.title + '</div><div class="alert-body">' + a.message + '</div>';
        alertGrid.appendChild(div);
      });
    }
  }

  function fetchJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('Failed to load ' + url);
      return res.json();
    });
  }

  function runAllInits(metrics, reviews, competitors) {
    initKpis(metrics || {});
    initCharts(metrics || {}, competitors || {}, reviews || {});
    initMap(competitors || {});
    initCompetitionCards(competitors || {});
    initReviewsTabs(reviews || {});
    initWeather(metrics || {});
  }

  window.reinitDashboard = function () {
    if (_cachedMetrics || _cachedReviews || _cachedCompetitors) {
      runAllInits(_cachedMetrics, _cachedReviews, _cachedCompetitors);
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (window.lucide && lucide.createIcons) { lucide.createIcons(); }
    Promise.allSettled([
      fetchJson(metricsUrl),
      fetchJson(reviewsUrl),
      fetchJson(competitorsUrl)
    ]).then(function (results) {
      _cachedMetrics = results[0].status === 'fulfilled' ? results[0].value : null;
      _cachedReviews = results[1].status === 'fulfilled' ? results[1].value : null;
      _cachedCompetitors = results[2].status === 'fulfilled' ? results[2].value : null;
      runAllInits(_cachedMetrics, _cachedReviews, _cachedCompetitors);
      initScrollSpy();
    }).catch(function (err) {
      console.error(err);
      initScrollSpy();
    });
  });
})();
