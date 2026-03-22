/* assets/js/data-loader.js
 *
 * Fetch JSON data and initialize KPIs, charts, static map with dots,
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
    buildChart('chart-occupancy', { type:'line', data:{ labels:occ.map(function(p){return p.date.slice(5);}), datasets:[{label:'Occupancy %',data:occ.map(function(p){return p.occupancy_pct;}),borderColor:'#22d3ee',backgroundColor:'rgba(34,211,238,0.25)',tension:0.35,fill:true,pointRadius:3,pointBackgroundColor:'#22d3ee'}]}, options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#64748b',font:{size:10},callback:function(v){return v+'%';}},grid:{color:'rgba(15,23,42,0.7)'}}}} });
    var moves = metrics.move_activity_weekly || [];
    buildChart('chart-moves', { type:'bar', data:{ labels:moves.map(function(p){return p.week_of.slice(5);}), datasets:[{label:'Move-Ins',data:moves.map(function(p){return p.move_ins;}),backgroundColor:'rgba(34,197,94,0.9)'},{label:'Move-Outs',data:moves.map(function(p){return p.move_outs;}),backgroundColor:'rgba(248,113,113,0.9)'}]}, options:{responsive:true,plugins:{legend:{display:true,labels:{color:'#9ca3af',font:{size:10}}}},scales:{x:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#64748b',font:{size:10}},grid:{color:'rgba(15,23,42,0.7)'}}}} });
    var eq = metrics.uhaul_equipment_mix || [];
    buildChart('chart-uhaul', { type:'doughnut', data:{ labels:eq.map(function(p){return p.type;}), datasets:[{data:eq.map(function(p){return p.revenue_mtd||p.count;}),backgroundColor:['#22c55e','#22d3ee','#facc15','#a855f7']}]}, options:{responsive:true,plugins:{legend:{display:true,labels:{color:'#9ca3af',font:{size:10}}}},cutout:'60%'} });
    var turnovers = metrics.weekly_turnovers || [];
    buildChart('chart-turnovers', { type:'bar', data:{ labels:turnovers.map(function(p){return p.week_of.slice(5);}), datasets:[{label:'Units Turned',data:turnovers.map(function(p){return p.units_turned;}),backgroundColor:'rgba(56,189,248,0.9)'}]}, options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#64748b',font:{size:10}},grid:{color:'rgba(15,23,42,0.7)'}}}} });
    var weekly = metrics.weekly_revenue || [];
    buildChart('chart-weekly-revenue', { type:'bar', data:{ labels:weekly.map(function(p){return p.week_of.slice(5);}), datasets:[{label:'Storage',data:weekly.map(function(p){return p.storage;}),backgroundColor:'rgba(34,197,94,0.9)'},{label:'U-Haul',data:weekly.map(function(p){return p.uhaul;}),backgroundColor:'rgba(34,211,238,0.9)'}]}, options:{responsive:true,plugins:{legend:{display:true,labels:{color:'#9ca3af',font:{size:10}}}},scales:{x:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}},y:{ticks:{color:'#64748b',font:{size:10}},grid:{color:'rgba(15,23,42,0.7)'}}}} });
    var types = metrics.occupancy_by_unit_type || [];
    buildChart('chart-unit-types', { type:'bar', data:{ labels:types.map(function(t){return t.type+(t.climate?' (CC)':'');}), datasets:[{label:'Occupancy %',data:types.map(function(t){if(!t.total)return 0;return Math.round((t.occupied/t.total)*100);}),backgroundColor:'rgba(34,197,94,0.9)'}]}, options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#64748b',font:{size:10},callback:function(v){return v+'%';}},grid:{color:'rgba(15,23,42,0.7)'}},y:{ticks:{color:'#64748b',font:{size:10}},grid:{display:false}}}} });
    if (competitors && competitors.comparisons) {
      var nc = competitors.comparisons.non_climate_10x10 || {};
      var ncF = nc.facilities || [];
      buildChart('chart-pricing-nc', { type:'bar', data:{ labels:ncF.map(function(f){return f.name;}), datasets:[{label:'10x10 NC',data:ncF.map(function(f){return f.price||0;}),backgroundColor:ncF.map(function(f){return f.name==='Mountain Storage'?'rgba(34,197,94,0.95)':'rgba(34,211,238,0.8)';})}]}, options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#64748b',font:{size:9}},grid:{display:false}},y:{ticks:{color:'#64748b',font:{size:10},callback:function(v){return '$'+v;}},grid:{color:'rgba(15,23,42,0.7)'}}}} });
      var cc = competitors.comparisons.climate_pricing || {};
      var ccEx = cc.examples || [];
      buildChart('chart-pricing-cc', { type:'bar', data:{ labels:ccEx.map(function(e){return e.name+' '+e.size;}), datasets:[{label:'Climate',data:ccEx.map(function(e){return e.price||0;}),backgroundColor:ccEx.map(function(e){return e.name==='Mountain Storage'?'rgba(34,197,94,0.95)':'rgba(56,189,248,0.85)';})}]}, options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#64748b',font:{size:9}},grid:{display:false}},y:{ticks:{color:'#64748b',font:{size:10},callback:function(v){return '$'+v;}},grid:{color:'rgba(15,23,42,0.7)'}}}} });
    }
    if (reviews && reviews.facilities) {
      var facs = reviews.facilities;
      buildChart('chart-google-reviews', { type:'bar', data:{ labels:facs.map(function(f){return f.name;}), datasets:[{label:'Rating',data:facs.map(function(f){return f.google_rating||0;}),backgroundColor:facs.map(function(f){return f.name==='Mountain Storage'?'rgba(34,197,94,0.95)':'rgba(34,211,238,0.85)';})}]}, options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#64748b',font:{size:9}},grid:{display:false}},y:{ticks:{color:'#64748b',font:{size:10}},grid:{color:'rgba(15,23,42,0.7)'},min:3.5,max:5.1}}} });
    }
    if (competitors && competitors.facilities) {
      var facs2 = competitors.facilities;
      buildChart('chart-office-hours', { type:'bar', data:{ labels:facs2.map(function(f){return f.name;}), datasets:[{label:'Office Hours / Week',data:facs2.map(function(f){return f.weekly_office_hours||0;}),backgroundColor:facs2.map(function(f){return f.name==='Mountain Storage'?'rgba(34,197,94,0.95)':'rgba(59,130,246,0.85)';})}]}, options:{plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#64748b',font:{size:9}},grid:{display:false}},y:{ticks:{color:'#64748b',font:{size:10}},grid:{color:'rgba(15,23,42,0.7)'}}}} });
    }
  }

  function initMap(competitors) {
    if (!competitors || !competitors.facilities) return;
    var mapEl = document.getElementById('competition-map');
    if (!mapEl) return;
    /* Use static map image with CSS dot overlays */
    var facilities = competitors.facilities;
    /* Map bounds: lat 34.38-34.58, lng -93.15 to -92.95 */
    var minLat = 34.38, maxLat = 34.58, minLng = -93.15, maxLng = -92.95;
    var staticUrl = 'https://maps.geoapify.com/v1/staticmap?style=dark-matter-dark-grey&width=800&height=400&center=lonlat:-93.05,34.50&zoom=11&apiKey=demo';
    mapEl.innerHTML = '';
    mapEl.style.position = 'relative';
    mapEl.style.background = 'linear-gradient(135deg, #0a1628 0%, #071020 50%, #050d1a 100%)';
    mapEl.style.overflow = 'hidden';
    /* Draw road-like grid lines for visual effect */
    var svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('width','100%');
    svg.setAttribute('height','100%');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.opacity = '0.15';
    svg.innerHTML = '<line x1="10%" y1="0" x2="40%" y2="100%" stroke="#22d3ee" stroke-width="0.5"/><line x1="30%" y1="0" x2="70%" y2="100%" stroke="#22d3ee" stroke-width="0.5"/><line x1="60%" y1="0" x2="90%" y2="100%" stroke="#22d3ee" stroke-width="0.5"/><line x1="0" y1="25%" x2="100%" y2="30%" stroke="#22d3ee" stroke-width="0.5"/><line x1="0" y1="55%" x2="100%" y2="60%" stroke="#22d3ee" stroke-width="0.5"/><line x1="0" y1="80%" x2="100%" y2="75%" stroke="#22d3ee" stroke-width="0.5"/>';
    mapEl.appendChild(svg);
    /* Add label */
    var label = document.createElement('div');
    label.style.cssText = 'position:absolute;bottom:6px;left:8px;font-size:9px;color:rgba(148,163,184,0.5);z-index:2;';
    label.textContent = 'Hot Springs, AR \u00b7 7mi radius';
    mapEl.appendChild(label);
    /* Place dots for each facility */
    facilities.forEach(function(f, idx) {
      if (typeof f.lat !== 'number' || typeof f.lng !== 'number') return;
      var isYou = f.role === 'you';
      var pctX = ((f.lng - minLng) / (maxLng - minLng)) * 100;
      var pctY = ((maxLat - f.lat) / (maxLat - minLat)) * 100;
      pctX = Math.max(5, Math.min(95, pctX));
      pctY = Math.max(5, Math.min(95, pctY));
      var dot = document.createElement('div');
      dot.className = 'map-dot' + (isYou ? ' map-dot-you' : '');
      dot.style.cssText = 'position:absolute;left:'+pctX+'%;top:'+pctY+'%;transform:translate(-50%,-50%);z-index:3;cursor:pointer;';
      if (isYou) {
        dot.innerHTML = '<div style="width:18px;height:18px;border-radius:50%;background:radial-gradient(circle,#bbf7d0,#22c55e);box-shadow:0 0 12px #22c55e,0 0 24px rgba(34,197,94,0.5);border:2px solid #bbf7d0;"></div><div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:9px;font-weight:600;color:#bbf7d0;text-shadow:0 0 6px rgba(34,197,94,0.8);">\u2605 YOU</div>';
      } else {
        dot.innerHTML = '<div style="width:10px;height:10px;border-radius:50%;background:radial-gradient(circle,#67e8f9,#0891b2);box-shadow:0 0 8px rgba(34,211,238,0.6);border:1px solid #67e8f9;"></div>';
      }
      /* Popup on hover */
      var popup = document.createElement('div');
      popup.className = 'map-popup';
      popup.style.cssText = 'display:none;position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:rgba(2,6,23,0.95);border:1px solid rgba(34,211,238,0.5);border-radius:8px;padding:8px 10px;min-width:180px;z-index:10;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,0.7);';
      var ratingStr = f.google_rating ? f.google_rating.toFixed(1) + '\u2605 (' + (f.google_review_count||0) + ')' : '';
      popup.innerHTML = '<div style="font-size:12px;font-weight:600;color:#e5f4ff;margin-bottom:3px;">' + f.name + '</div><div style="font-size:10px;color:#9ca3af;">' + (f.distance_mi != null ? f.distance_mi.toFixed(1) + 'mi \u00b7 ' : '') + (ratingStr) + '</div><div style="font-size:10px;color:#6b7280;margin-top:2px;">' + (f.address||'') + '</div>';
      dot.appendChild(popup);
      dot.addEventListener('mouseenter', function() { popup.style.display = 'block'; });
      dot.addEventListener('mouseleave', function() { popup.style.display = 'none'; });
      dot.addEventListener('click', function() { focusCard(idx); });
      mapEl.appendChild(dot);
    });
  }

  function focusMarker(index) { /* no-op for static map */ }

  function focusCard(index) {
    var cards = Array.from(document.querySelectorAll('.competition-card'));
    cards.forEach(function (card, idx) {
      if (idx === index) card.classList.add('active');
      else card.classList.remove('active');
    });
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
          card.innerHTML = '<div class="review-header"><span class="review-name">' + (rev.author || 'Customer') + '</span> <span class="review-stars">' + '\u2605'.repeat(rev.rating || 5) + '</span></div>' +
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
        span.innerHTML = '<div style="font-weight:500;color:#e5f4ff;">' + (d.day || '') + '</div><div>' + (d.conditions || '') + '</div><div>' + (d.high_f || '') + '\u00b0 / ' + (d.low_f || '') + '\u00b0</div>';
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
