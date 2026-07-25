// uv.js - Dedicated UV Index Drawer Logic for Isla Intelligence
import { streamChat } from './api.js';

let uvLoaded = false;
let currentCoords = null; // Store detected coords so we don't spam requests
let forecastData = null; // Store full Open-Meteo forecast payload
let activeDayIndex = 0; // Currently selected day (0 = Today, 1 = Tomorrow, etc.)
let geocodedLocationName = 'Your Location';

export function initUvView() {
  const uvBtn = document.getElementById('btn-uv-tab');
  const headerUvBtn = document.getElementById('btn-header-uv');
  const widgetUvBtn = document.getElementById('widget-uv');
  const closeBtn = document.getElementById('btn-close-uv-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const retryBtn = document.getElementById('btn-retry-uv');

  const toggleDrawer = () => {
    const drawer = document.getElementById('uv-drawer');
    if (drawer?.classList.contains('open')) {
      closeUvDrawer();
    } else {
      openUvDrawer();
    }
  };

  if (uvBtn) uvBtn.addEventListener('click', toggleDrawer);
  if (headerUvBtn) headerUvBtn.addEventListener('click', toggleDrawer);
  if (widgetUvBtn) widgetUvBtn.addEventListener('click', toggleDrawer);

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeUvDrawer());
  }

  if (backdrop) {
    backdrop.addEventListener('click', () => closeUvDrawer());
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      uvLoaded = false;
      loadUvDashboard();
    });
  }

  setupCollapsibles();
}

function setupCollapsibles() {
  const btnOil = document.getElementById('btn-toggle-tanning-oil');
  const contentOil = document.getElementById('content-tanning-oil');
  const chevronOil = document.getElementById('chevron-tanning-oil');

  const btnAi = document.getElementById('btn-toggle-ai-summary');
  const contentAi = document.getElementById('content-ai-summary');
  const chevronAi = document.getElementById('chevron-ai-summary');

  if (btnOil && contentOil && chevronOil) {
    btnOil.addEventListener('click', () => {
      const isCollapsed = contentOil.classList.contains('hidden');
      if (isCollapsed) {
        contentOil.classList.remove('hidden');
        chevronOil.style.transform = 'rotate(180deg)';
      } else {
        contentOil.classList.add('hidden');
        chevronOil.style.transform = 'rotate(0deg)';
      }
    });
  }

  if (btnAi && contentAi && chevronAi) {
    btnAi.addEventListener('click', () => {
      const isCollapsed = contentAi.classList.contains('hidden');
      if (isCollapsed) {
        contentAi.classList.remove('hidden');
        chevronAi.style.transform = 'rotate(180deg)';
      } else {
        contentAi.classList.add('hidden');
        chevronAi.style.transform = 'rotate(0deg)';
      }
    });
  }
}

export function openUvDrawer() {
  const drawer = document.getElementById('uv-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (!drawer || !backdrop) return;

  // Make sure memory drawer is closed
  document.getElementById('memory-drawer')?.classList.remove('open');

  drawer.classList.add('open');
  backdrop.classList.remove('hidden');
  backdrop.offsetWidth;
  backdrop.classList.add('show');

  loadUvDashboard();
}

export function closeUvDrawer() {
  const drawer = document.getElementById('uv-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  if (!drawer || !backdrop) return;

  drawer.classList.remove('open');
  
  const isMemoryOpen = document.getElementById('memory-drawer')?.classList.contains('open');
  if (!isMemoryOpen) {
    backdrop.classList.remove('show');
    setTimeout(() => {
      const stillMemoryOpen = document.getElementById('memory-drawer')?.classList.contains('open');
      const stillUvOpen = document.getElementById('uv-drawer')?.classList.contains('open');
      if (!stillMemoryOpen && !stillUvOpen) {
        backdrop.classList.add('hidden');
      }
    }, 300);
  }
}

async function loadUvDashboard() {
  if (uvLoaded) return; // Keep existing data if already loaded to avoid repeat GPS prompts

  const loadingEl = document.getElementById('uv-loading');
  const errorEl = document.getElementById('uv-error');
  const contentEl = document.getElementById('uv-dashboard-content');
  const locationText = document.getElementById('uv-location-text');
  const aiSummaryCard = document.getElementById('uv-ai-summary-card');
  const aiSummaryLoading = document.getElementById('uv-ai-summary-loading');
  const aiSummaryText = document.getElementById('uv-ai-summary-text');
  const contentAi = document.getElementById('content-ai-summary');
  const chevronAi = document.getElementById('chevron-ai-summary');

  if (loadingEl) loadingEl.classList.remove('hidden');
  if (errorEl) errorEl.classList.add('hidden');
  if (contentEl) contentEl.classList.add('hidden');
  if (locationText) locationText.textContent = 'Detecting your location...';
  if (aiSummaryCard) aiSummaryCard.classList.add('hidden');
  if (aiSummaryLoading) aiSummaryLoading.classList.remove('hidden');
  if (contentAi) contentAi.classList.add('hidden'); // Keep collapsed
  if (chevronAi) chevronAi.style.transform = 'rotate(0deg)';
  if (aiSummaryText) {
    aiSummaryText.textContent = '';
    aiSummaryText.classList.add('hidden');
  }

  try {
    const coords = await getCoordinates();
    currentCoords = coords;
    
    // Attempt reverse geocoding to display a location name (optional fallback to generic text)
    let locationName = coords.isFallback ? 'Edinburgh (Default location)' : 'Your Location';
    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=10`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const city = geoData.address.city || geoData.address.town || geoData.address.village || geoData.address.county;
        if (city) {
          locationName = city;
        }
      }
    } catch (_) {
      // Swallow reverse geocoding errors silently
    }
    
    geocodedLocationName = locationName;
    if (locationText) {
      locationText.textContent = geocodedLocationName;
    }

    const data = await fetchUvData(coords.lat, coords.lng);
    forecastData = data;
    activeDayIndex = 0; // Default to today

    // Render interactive day elements and forecast dashboard
    renderUvDashboard();
    
    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('hidden');
    uvLoaded = true;

    // Trigger AI Tanning Forecast analysis asynchronously
    generateAiTanningSummary();
  } catch (err) {
    // Suppressed
    if (loadingEl) loadingEl.classList.add('hidden');
    if (errorEl) errorEl.classList.remove('hidden');
  }
}

function getCoordinates() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: 55.94852, lng: -3.19003, isFallback: true }); // Edinburgh default
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, isFallback: false });
      },
      () => {
        resolve({ lat: 55.94852, lng: -3.19003, isFallback: true });
      },
      { timeout: 8000 }
    );
  });
}

async function fetchUvData(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=uv_index,cloud_cover&daily=uv_index_max&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('API request failed');
  return await res.json();
}

function renderUvDashboard() {
  if (!forecastData) return;

  const data = forecastData;
  const dayOffset = activeDayIndex;

  // 1. Current/Selected UV Index value and level
  const uvValueEl = document.getElementById('uv-value');
  const levelPill = document.getElementById('uv-level-pill');
  const safetyAdviceEl = document.getElementById('uv-safety-advice');
  const cloudRow = document.getElementById('uv-cloud-row');
  const cloudText = document.getElementById('uv-cloud-text');
  const locationText = document.getElementById('uv-location-text');

  // Find target hour (same hour as now, but offset by dayOffset days)
  const now = new Date();
  const targetDate = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const date = String(targetDate.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0'); // Show same hour forecast
  const targetTimeStr = `${year}-${month}-${date}T${hour}:00`;

  const idx = data.hourly.time.indexOf(targetTimeStr);
  const currentUv = idx !== -1 ? Number(data.hourly.uv_index[idx]) : 0;
  const currentCloud = idx !== -1 ? Number(data.hourly.cloud_cover[idx]) : 0;

  if (uvValueEl) uvValueEl.textContent = currentUv.toFixed(1);

  // Set location and date text label cleanly (without double icons)
  if (locationText) {
    const formattedDate = targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
    locationText.textContent = `${geocodedLocationName} • ${formattedDate}`;
  }

  // Determine levels and styles
  let level = 'Low';
  let pillStyle = 'background: rgba(76, 175, 80, 0.1); color: #2e7d32;'; // Green
  let safetyAdvice = 'No sun protection required. Safe to stay outside.';
  let burnTimeText = '60+ Minutes';

  if (currentUv >= 3 && currentUv < 6) {
    level = 'Moderate';
    pillStyle = 'background: rgba(255, 152, 0, 0.1); color: #ef6c00;'; // Orange
    safetyAdvice = 'Slip on a shirt, slop on sunscreen (SPF 15+), and slap on a hat. Seek shade during midday.';
    burnTimeText = '30-45 Minutes';
  } else if (currentUv >= 6 && currentUv < 8) {
    level = 'High';
    pillStyle = 'background: rgba(244, 67, 54, 0.1); color: #c62828;'; // Red
    safetyAdvice = 'Generous SPF 30+ protection is required. Avoid direct sun between 11 AM and 3 PM. Wear protective clothing.';
    burnTimeText = '15-20 Minutes';
  } else if (currentUv >= 8 && currentUv < 11) {
    level = 'Very High';
    pillStyle = 'background: rgba(233, 30, 99, 0.1); color: #ad1457;'; // Pink-magenta
    safetyAdvice = 'Extra protection required. Unprotected skin can burn in minutes. Stay in the shade and wear hats/sunglasses.';
    burnTimeText = '10 Minutes';
  } else if (currentUv >= 11) {
    level = 'Extreme';
    pillStyle = 'background: rgba(156, 39, 176, 0.1); color: #6a1b9a;'; // Purple
    safetyAdvice = 'Avoid exposure entirely. Sunburn can occur almost instantly. Stay indoors or fully covered up.';
    burnTimeText = 'Under 10 Minutes';
  }

  if (levelPill) {
    levelPill.textContent = level;
    levelPill.style.cssText = pillStyle + ' font-weight:700;';
  }
  if (safetyAdviceEl) safetyAdviceEl.textContent = safetyAdvice;

  // Cloud cover display with helpful context
  if (cloudRow && cloudText) {
    let cloudAdvice = '';
    if (currentCloud < 20) {
      cloudAdvice = 'Clear skies (Full UV rays)';
    } else if (currentCloud >= 20 && currentCloud < 60) {
      cloudAdvice = 'Partly cloudy (Reflection scatter risk)';
    } else if (currentCloud >= 60 && currentCloud < 90) {
      cloudAdvice = 'Cloudy (Partially filters UV index)';
    } else {
      cloudAdvice = 'Overcast (Blocks ~70% UV index)';
    }
    cloudText.textContent = `Cloud Cover: ${currentCloud}% - ${cloudAdvice}`;
    cloudRow.classList.remove('hidden');
  }

  // 2. Tanning Optimizer Window
  const tanWindowEl = document.getElementById('uv-tan-window');
  const burnTimeEl = document.getElementById('uv-burn-time');
  const tanTipEl = document.getElementById('uv-tan-tip');
  const oilCard = document.getElementById('uv-tanning-oil-card');
  const oilText = document.getElementById('uv-tanning-oil-text');

  if (burnTimeEl) burnTimeEl.textContent = `Safe Sunburn Limit: ${burnTimeText}`;

  // Calculate day-specific hours (each day occupies a 24-hour block)
  const startIndex = dayOffset * 24;
  const endIndex = startIndex + 24;
  const dayUv = data.hourly.uv_index.slice(startIndex, endIndex);
  const dayTime = data.hourly.time.slice(startIndex, endIndex);
  const dayCloud = data.hourly.cloud_cover.slice(startIndex, endIndex);

  const peakUv = Math.max(...dayUv);

  let tanningRecommendation = '';
  let tanWindowText = 'Too low for tanning';
  let oilAdvice = '';

  if (peakUv < 3) {
    tanWindowText = 'Not Recommended';
    tanningRecommendation = 'UV index is too low for effective tanning. Wait for sunnier days! ☁️ For tanning, a UV Index of 3 or above is required.';
    oilAdvice = 'Melanin production is not stimulated at this UV level. Tanning oils will not provide any benefit.';
  } else if (peakUv > 7) {
    const safeTanningHours = [];
    for (let i = 0; i < 24; i++) {
      if (dayUv[i] >= 3 && dayUv[i] <= 6) {
        const timeVal = new Date(dayTime[i]);
        const hr = timeVal.getHours();
        safeTanningHours.push(hr);
      }
    }

    if (safeTanningHours.length > 0) {
      const minHr = Math.min(...safeTanningHours);
      const maxHr = Math.max(...safeTanningHours);
      tanWindowText = `${formatHour(minHr)} - ${formatHour(maxHr)}`;
      tanningRecommendation = `Peak UV is very high (${peakUv.toFixed(1)}). Tan strictly during the morning or late afternoon to prevent sunburn. Avoid tanning during peak UV hours.`;
      oilAdvice = '⚠️ <strong>Warning:</strong> Peak UV index is too high today. Avoid zero-SPF tanning oils entirely, as they accelerate burning. Use a broad-spectrum SPF 30+ sunscreen instead during peak sun.';
    } else {
      tanWindowText = 'Early morning / late afternoon';
      tanningRecommendation = `Midday UV is dangerously high (${peakUv.toFixed(1)}). Stick to brief periods in the shade to prevent skin damage.`;
      oilAdvice = '❌ <strong>Do not use tanning oil.</strong> The UV index is in the danger zone. Prioritize sunscreen with high SPF to avoid sunburns.';
    }
  } else {
    // Peak UV is between 3 and 7 (perfect goldilocks tanning zone!)
    const activeTanningHours = [];
    for (let i = 0; i < 24; i++) {
      if (dayUv[i] >= 3) {
        const timeVal = new Date(dayTime[i]);
        const hr = timeVal.getHours();
        activeTanningHours.push(hr);
      }
    }
    const minHr = Math.min(...activeTanningHours);
    const maxHr = Math.max(...activeTanningHours);
    
    // Check if cloud cover is high during the peak window
    let averageCloudWindow = 0;
    let windowHourCount = 0;
    for (let i = minHr; i <= maxHr; i++) {
      averageCloudWindow += dayCloud[i];
      windowHourCount++;
    }
    averageCloudWindow = windowHourCount > 0 ? (averageCloudWindow / windowHourCount) : 0;

    tanWindowText = `${formatHour(minHr)} - ${formatHour(maxHr)}`;
    tanningRecommendation = `Perfect tanning conditions! Goldilocks UV level (${peakUv.toFixed(1)} max). Tanning is highly efficient during this window. Use SPF to prevent long-term damage.`;
    
    if (averageCloudWindow > 50) {
      tanningRecommendation += ` Note: Cloud cover is averaging ${Math.round(averageCloudWindow)}% during this window. Melanin will still develop, but tanning may be slightly slower.`;
    }

    oilAdvice = `☀️ <strong>Optimal Tanning Oil Window:</strong> Apply a tanning oil containing **SPF 8 to 15** (e.g. coconut oil with sunscreen or bronzing oil) 15 minutes before going out. Reapply every 2 hours or immediately after swimming to maintain hydration and protect the skin barrier.`;
  }

  if (tanWindowEl) tanWindowEl.textContent = tanWindowText;
  if (tanTipEl) tanTipEl.textContent = tanningRecommendation;
  
  if (oilCard && oilText) {
    oilText.innerHTML = oilAdvice;
    oilCard.classList.remove('hidden');
  }

  // 3. Render Selected Day's UV Index Curve Graph
  const graphLabel = document.getElementById('uv-graph-day-label');
  if (graphLabel) {
    const dayLabel = dayOffset === 0 ? 'Today' : targetDate.toLocaleDateString('en-US', { weekday: 'long' });
    graphLabel.textContent = `${dayLabel} (6 AM - 8 PM)`;
  }
  
  const activePlotHour = dayOffset === 0 ? now.getHours() : -1;
  renderUvCurveGraph(dayUv, activePlotHour);

  // 4. Render and Bind Interactive Weekly Outlook rows
  renderWeeklyForecastList();
}

function renderWeeklyForecastList() {
  if (!forecastData) return;

  const data = forecastData;
  const weeklyListEl = document.getElementById('uv-weekly-list');
  if (!weeklyListEl) return;

  weeklyListEl.innerHTML = '';
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  for (let i = 0; i < 7; i++) {
    const dateVal = new Date(data.daily.time[i]);
    const dayName = i === 0 ? 'Today' : daysOfWeek[dateVal.getDay()];
    const maxUvVal = Number(data.daily.uv_index_max[i]);
    const barPercentage = Math.min(100, (maxUvVal / 12) * 100);

    let barFillColor = '#4caf50'; // Green
    let dailyLevel = 'Low';
    if (maxUvVal >= 3 && maxUvVal < 6) {
      barFillColor = '#ff9800'; // Orange
      dailyLevel = 'Mod';
    } else if (maxUvVal >= 6 && maxUvVal < 8) {
      barFillColor = '#f44336'; // Red
      dailyLevel = 'High';
    } else if (maxUvVal >= 8) {
      barFillColor = '#ad1457'; // Magenta
      dailyLevel = 'V. High';
    }

    const row = document.createElement('div');
    row.className = `weekly-row${i === activeDayIndex ? ' active' : ''}`;
    row.innerHTML = `
      <span class="weekly-day">${dayName}</span>
      <div class="weekly-bar-container">
        <div class="weekly-bar-fill" style="width: ${barPercentage}%; background-color: ${barFillColor};"></div>
      </div>
      <span class="weekly-uv-badge" style="background: rgba(172,36,113,0.05); color: ${barFillColor}; border: 1px solid ${barFillColor}33;">
        ${maxUvVal.toFixed(1)} ${dailyLevel}
      </span>
    `;

    row.addEventListener('click', () => {
      activeDayIndex = i;
      renderUvDashboard();
    });

    weeklyListEl.appendChild(row);
  }
}

function renderUvCurveGraph(daylightUv, currentHour) {
  const container = document.getElementById('uv-graph-container');
  if (!container) return;

  // Daylight hours: 6 AM to 8 PM (inclusive daylight indices 6 to 20, total 15 hours)
  const daylightSlice = daylightUv.slice(6, 21);
  
  const width = 290;
  const height = 100;
  const paddingLeft = 25;
  const paddingRight = 15;
  const paddingTop = 15;
  const paddingBottom = 20;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  
  let points = [];
  for (let i = 0; i < daylightSlice.length; i++) {
    const val = Number(daylightSlice[i]);
    const x = paddingLeft + (i * (chartWidth / 14));
    const y = paddingTop + chartHeight - (Math.min(12, val) / 12) * chartHeight;
    points.push({ x, y, uv: val });
  }

  // Curve paths
  let areaPath = `M ${points[0].x} ${paddingTop + chartHeight} `;
  points.forEach(p => {
    areaPath += `L ${p.x} ${p.y} `;
  });
  areaPath += `L ${points[points.length - 1].x} ${paddingTop + chartHeight} Z`;

  let strokePath = `M ${points[0].x} ${points[0].y} `;
  for (let i = 1; i < points.length; i++) {
    strokePath += `L ${points[i].x} ${points[i].y} `;
  }

  let currentHourCircle = '';
  if (currentHour >= 6 && currentHour <= 20) {
    const currentPt = points[currentHour - 6];
    if (currentPt) {
      currentHourCircle = `
        <circle cx="${currentPt.x}" cy="${currentPt.y}" r="7" fill="#ac2471" opacity="0.3">
          <animate attributeName="r" values="5;10;5" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="${currentPt.x}" cy="${currentPt.y}" r="4" fill="#ffffff" stroke="#ac2471" stroke-width="2.5" />
      `;
    }
  }

  const yUv3 = paddingTop + chartHeight - (3 / 12) * chartHeight;
  const yUv6 = paddingTop + chartHeight - (6 / 12) * chartHeight;
  const yUv9 = paddingTop + chartHeight - (9 / 12) * chartHeight;

  const svgContent = `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="overflow:visible; font-family:sans-serif;">
      <defs>
        <linearGradient id="uv-gradient-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ac2471" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#ac2471" stop-opacity="0.0"/>
        </linearGradient>
        <linearGradient id="uv-stroke-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ac2471"/>
          <stop offset="50%" stop-color="#7212ff"/>
          <stop offset="100%" stop-color="#ac2471"/>
        </linearGradient>
      </defs>

      <!-- Grid guidelines -->
      <line x1="${paddingLeft}" y1="${yUv3}" x2="${width - paddingRight}" y2="${yUv3}" stroke="#ac2471" stroke-opacity="0.15" stroke-dasharray="3,3" stroke-width="1"/>
      <line x1="${paddingLeft}" y1="${yUv6}" x2="${width - paddingRight}" y2="${yUv6}" stroke="#ac2471" stroke-opacity="0.15" stroke-dasharray="3,3" stroke-width="1"/>
      <line x1="${paddingLeft}" y1="${yUv9}" x2="${width - paddingRight}" y2="${yUv9}" stroke="#ac2471" stroke-opacity="0.15" stroke-dasharray="3,3" stroke-width="1"/>

      <!-- Guidelines labels -->
      <text x="${paddingLeft - 6}" y="${yUv3 + 3}" fill="#564149" opacity="0.5" font-size="8" font-weight="bold" text-anchor="end">3</text>
      <text x="${paddingLeft - 6}" y="${yUv6 + 3}" fill="#564149" opacity="0.5" font-size="8" font-weight="bold" text-anchor="end">6</text>
      <text x="${paddingLeft - 6}" y="${yUv9 + 3}" fill="#564149" opacity="0.5" font-size="8" font-weight="bold" text-anchor="end">9</text>

      <!-- Fill area under curve -->
      <path d="${areaPath}" fill="url(#uv-gradient-fill)" />

      <!-- Curve Stroke line -->
      <path d="${strokePath}" fill="none" stroke="url(#uv-stroke-grad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

      <!-- X axis labels -->
      <text x="${paddingLeft}" y="${height - 4}" fill="#564149" opacity="0.6" font-size="8.5" font-weight="bold" text-anchor="middle">6 AM</text>
      <text x="${paddingLeft + 6 * (chartWidth / 14)}" y="${height - 4}" fill="#564149" opacity="0.6" font-size="8.5" font-weight="bold" text-anchor="middle">12 PM</text>
      <text x="${paddingLeft + 10 * (chartWidth / 14)}" y="${height - 4}" fill="#564149" opacity="0.6" font-size="8.5" font-weight="bold" text-anchor="middle">4 PM</text>
      <text x="${width - paddingRight}" y="${height - 4}" fill="#564149" opacity="0.6" font-size="8.5" font-weight="bold" text-anchor="middle">8 PM</text>

      <!-- Active point overlay -->
      ${currentHourCircle}
    </svg>
  `;

  container.innerHTML = svgContent;
}

async function generateAiTanningSummary() {
  if (!forecastData) return;

  const aiSummaryCard = document.getElementById('uv-ai-summary-card');
  const aiSummaryLoading = document.getElementById('uv-ai-summary-loading');
  const aiSummaryText = document.getElementById('uv-ai-summary-text');

  if (aiSummaryCard) aiSummaryCard.classList.remove('hidden');
  if (aiSummaryLoading) aiSummaryLoading.classList.remove('hidden');
  if (aiSummaryText) {
    aiSummaryText.innerHTML = '';
    aiSummaryText.classList.add('hidden');
  }

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const forecastItems = [];

  for (let i = 0; i < 7; i++) {
    const dateVal = new Date(forecastData.daily.time[i]);
    const dayName = i === 0 ? 'Today' : daysOfWeek[dateVal.getDay()];
    const maxUvVal = Number(forecastData.daily.uv_index_max[i]);
    forecastItems.push(`${dayName}: Max UV ${maxUvVal.toFixed(1)}`);
  }

  const promptString = `Here is this week's UV index forecast:
${forecastItems.join('\n')}

In exactly 3 sentences, provide a cozy, cute tanning outlook summary in the voice of a friendly sunbathing assistant. Mention which specific days of the week are ideal for tanning (UV 3-7) and highlight any days to avoid (extreme UV or too low). Use emojis. Keep it fun and bubbly!`;

  try {
    const { stream } = await streamChat({
      messages: [{ role: 'user', text: promptString }],
      toneValue: 90 // princess/cute tone value
    });

    let accumulatedText = '';
    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        if (aiSummaryLoading) aiSummaryLoading.classList.add('hidden');
        if (aiSummaryText) {
          accumulatedText += chunk.text;
          aiSummaryText.innerHTML = accumulatedText;
          aiSummaryText.classList.remove('hidden');
        }
      }
    }
  } catch (err) {
    // Suppressed
    if (aiSummaryLoading) aiSummaryLoading.classList.add('hidden');
    if (aiSummaryText) {
      aiSummaryText.innerHTML = "Isla is having trouble connecting to the clouds today! Check back in a bit for your custom sun advice. ☁️✨";
      aiSummaryText.classList.remove('hidden');
    }
  }
}

function formatHour(hr) {
  const suffix = hr >= 12 ? 'PM' : 'AM';
  const displayHr = hr % 12 || 12;
  return `${displayHr}:00 ${suffix}`;
}
