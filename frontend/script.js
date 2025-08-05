// DOM Elements
const dropdownBtn = document.getElementById('dropdown-btn');
const manualBtn = document.getElementById('manual-btn');
const dropdownSection = document.getElementById('dropdown-section');
const manualSection = document.getElementById('manual-section');
const predictForm = document.getElementById('predict-form');
const predictBtn = document.getElementById('predict-btn');
const resultsSection = document.getElementById('results-section');
const chartLoading = document.getElementById('chart-loading');
const predictionChart = document.getElementById('prediction-chart');
const resultsTable = document.getElementById('results-table');
const errorModal = document.getElementById('error-modal');
const errorMessage = document.getElementById('error-message');

// Configuration with optimized timing
const API_BASE_URL = 'https://evbackend-fsw9.onrender.com';
const KEEP_ALIVE_ENABLED = true;
const SMART_TIMING = {
    PING_INTERVAL: 14 * 60 * 1000,        // 14 minutes (just before 15min sleep)
    USER_INACTIVE_THRESHOLD: 3 * 60 * 1000, // 3 minutes of inactivity
    SESSION_TIMEOUT: 25 * 60 * 1000,      // 25 minutes total session
    CRITICAL_WAKE_TIME: 13 * 60 * 1000    // 13 minutes - critical wake up time
};

// State
let currentInputMethod = 'dropdown';
let serverStatus = 'unknown';
let lastSuccessfulConnection = null;
let connectionRetries = 0;
let sessionStartTime = Date.now();
let lastUserActivity = Date.now();

// Smart timing calculation
function calculateOptimalPingInterval() {
    const timeSinceLastSuccess = lastSuccessfulConnection 
        ? Date.now() - lastSuccessfulConnection 
        : Infinity;
    
    // Adaptive timing based on server responsiveness
    if (timeSinceLastSuccess < 5 * 60 * 1000) {
        return 14 * 60 * 1000; // 14 minutes - server is responsive
    } else if (timeSinceLastSuccess < 15 * 60 * 1000) {
        return 12 * 60 * 1000; // 12 minutes - server might be slowing
    } else {
        return 8 * 60 * 1000;  // 8 minutes - server is unstable
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    updateInputMethod('dropdown');
    
    // Track user activity for smart timing
    trackUserActivity();
    
    if (KEEP_ALIVE_ENABLED) {
        setupAdaptiveKeepAlive();
    }
});

// Track user activity to optimize timing
function trackUserActivity() {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
        document.addEventListener(event, () => {
            lastUserActivity = Date.now();
        }, { passive: true });
    });
}

// Adaptive keep-alive with smart timing
function setupAdaptiveKeepAlive() {
    let keepAliveTimer = null;
    let nextPingTime = null;
    
    function scheduleNextPing() {
        if (keepAliveTimer) {
            clearTimeout(keepAliveTimer);
        }
        
        const interval = calculateOptimalPingInterval();
        nextPingTime = Date.now() + interval;
        
        keepAliveTimer = setTimeout(async () => {
            await performSmartPing();
            scheduleNextPing(); // Schedule next ping
        }, interval);
        
        console.log(`📅 Next ping scheduled in ${interval/60000} minutes`);
        updatePingScheduleIndicator(interval);
    }
    
    async function performSmartPing() {
        // Check if user is still active in session
        const timeSinceActivity = Date.now() - lastUserActivity;
        const sessionDuration = Date.now() - sessionStartTime;
        
        // Don't ping if user inactive for too long or session expired
        if (timeSinceActivity > SMART_TIMING.USER_INACTIVE_THRESHOLD && 
            sessionDuration > SMART_TIMING.SESSION_TIMEOUT) {
            console.log('🛑 Stopping pings - user session expired');
            clearTimeout(keepAliveTimer);
            keepAliveTimer = null;
            return;
        }
        
        // Don't ping if no recent successful connection
        if (lastSuccessfulConnection && 
            (Date.now() - lastSuccessfulConnection) > 30 * 60 * 1000) {
            console.log('🛑 Stopping pings - server unresponsive too long');
            clearTimeout(keepAliveTimer);
            keepAliveTimer = null;
            return;
        }
        
        try {
            const startTime = Date.now();
            const response = await fetch(`${API_BASE_URL}/health`, { 
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            
            const responseTime = Date.now() - startTime;
            
            if (response.ok) {
                lastSuccessfulConnection = Date.now();
                console.log(`🔄 Smart ping successful (${responseTime}ms)`);
                updateServerStatusIndicator('online', responseTime);
            } else {
                throw new Error(`Status: ${response.status}`);
            }
        } catch (error) {
            console.log('⚠️ Smart ping failed:', error.message);
            serverStatus = 'offline';
            updateServerStatusIndicator('offline');
            
            // If ping fails, try once more before giving up
            setTimeout(async () => {
                try {
                    await fetch(`${API_BASE_URL}/health`, { 
                        signal: AbortSignal.timeout(3000) 
                    });
                    console.log('🔄 Recovery ping successful');
                } catch (recoveryError) {
                    console.log('🛑 Recovery failed - stopping pings');
                    clearTimeout(keepAliveTimer);
                    keepAliveTimer = null;
                }
            }, 30000); // Try recovery after 30 seconds
        }
    }
    
    // Start the adaptive ping system
    scheduleNextPing();
    
    // Reset session on user activity
    document.addEventListener('click', () => {
        if (!keepAliveTimer) {
            sessionStartTime = Date.now();
            scheduleNextPing();
            console.log('🚀 Ping system reactivated by user activity');
        }
    });
}

// Update ping schedule indicator
function updatePingScheduleIndicator(interval) {
    let indicator = document.getElementById('ping-schedule');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'ping-schedule';
        indicator.style.cssText = `
            position: fixed;
            bottom: 50px;
            right: 10px;
            padding: 4px 8px;
            background: rgba(59, 130, 246, 0.9);
            color: white;
            border-radius: 4px;
            font-size: 10px;
            z-index: 999;
        `;
        document.body.appendChild(indicator);
    }
    
    const minutes = Math.round(interval / 60000);
    indicator.textContent = `⏰ Next ping: ${minutes}min`;
    
    // Hide after 3 seconds
    setTimeout(() => {
        if (indicator.parentNode) {
            indicator.style.opacity = '0.5';
        }
    }, 3000);
}

// Rest of your existing functions...
async function checkServerStatus() {
    const startTime = Date.now();
    
    try {
        console.log('🔍 Checking server status...');
        const response = await fetch(`${API_BASE_URL}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(8000)
        });
        
        const responseTime = Date.now() - startTime;
        
        if (response.ok) {
            serverStatus = 'online';
            lastSuccessfulConnection = Date.now();
            connectionRetries = 0;
            console.log(`✅ Server online (${responseTime}ms)`);
            updateServerStatusIndicator('online', responseTime);
            return true;
        } else {
            throw new Error(`Status: ${response.status}`);
        }
    } catch (error) {
        const responseTime = Date.now() - startTime;
        console.log(`❌ Server offline (${responseTime}ms):`, error.message);
        serverStatus = 'offline';
        updateServerStatusIndicator('offline', responseTime);
        return false;
    }
}

async function wakeUpServer() {
    const startTime = Date.now();
    
    try {
        console.log('🔄 Waking up server...');
        updateLoadingMessage('Server starting up... Expected time: 20-30 seconds');
        
        const response = await fetch(`${API_BASE_URL}/`, {
            method: 'GET',
            signal: AbortSignal.timeout(45000)
        });
        
        const responseTime = Date.now() - startTime;
        
        if (response.ok) {
            serverStatus = 'online';
            lastSuccessfulConnection = Date.now();
            console.log(`✅ Server awake (${responseTime}ms)`);
            updateServerStatusIndicator('online', responseTime);
            return true;
        }
    } catch (error) {
        const responseTime = Date.now() - startTime;
        console.log(`❌ Wake-up failed (${responseTime}ms):`, error.message);
    }
    return false;
}

function updateServerStatusIndicator(status, responseTime = null) {
    let indicator = document.getElementById('server-status');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'server-status';
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: bold;
            z-index: 1000;
            transition: all 0.3s ease;
        `;
        document.body.appendChild(indicator);
    }
    
    if (status === 'online') {
        indicator.style.backgroundColor = '#10b981';
        indicator.style.color = 'white';
        const timeText = responseTime ? ` (${responseTime}ms)` : '';
        indicator.textContent = `🟢 Online${timeText}`;
    } else {
        indicator.style.backgroundColor = '#ef4444';
        indicator.style.color = 'white';
        const timeText = responseTime ? ` (${responseTime}ms)` : '';
        indicator.textContent = `🔴 Offline${timeText}`;
    }
}

function setupEventListeners() {
    dropdownBtn.addEventListener('click', () => updateInputMethod('dropdown'));
    manualBtn.addEventListener('click', () => updateInputMethod('manual'));
    predictForm.addEventListener('submit', handleFormSubmit);
    
    errorModal.addEventListener('click', function(e) {
        if (e.target === errorModal) {
            closeErrorModal();
        }
    });
}

function updateInputMethod(method) {
    currentInputMethod = method;
    
    dropdownBtn.classList.toggle('active', method === 'dropdown');
    manualBtn.classList.toggle('active', method === 'manual');
    
    dropdownSection.style.display = method === 'dropdown' ? 'block' : 'none';
    manualSection.style.display = method === 'manual' ? 'block' : 'none';
    
    document.getElementById('vehicle-select').value = '';
    document.getElementById('vehicle-input').value = '';
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    let vehicleType = '';
    if (currentInputMethod === 'dropdown') {
        vehicleType = document.getElementById('vehicle-select').value;
    } else {
        vehicleType = document.getElementById('vehicle-input').value.toLowerCase().trim();
    }
    
    if (!vehicleType) {
        showError('Please select or enter a vehicle type.');
        return;
    }
    
    if (!['car', 'bike', 'scooter', 'bus'].includes(vehicleType)) {
        showError('Please enter a valid vehicle type (car, bike, scooter, or bus).');
        return;
    }
    
    setLoadingState(true);
    
    try {
        if (serverStatus === 'offline' || serverStatus === 'unknown') {
            const isAwake = await wakeUpServer();
            if (!isAwake) {
                updateLoadingMessage('Final connection attempt...');
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const finalCheck = await checkServerStatus();
                if (!finalCheck) {
                    throw new Error('Server not responding. Please try again later.');
                }
            }
        }
        
        updateLoadingMessage('Processing AI prediction...');
        
        const formData = new FormData();
        formData.append('vehicle_type', vehicleType);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);
        
        console.log('🔄 Making prediction request...');
        
        const response = await fetch(`${API_BASE_URL}/predict/`, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error (${response.status}): ${errorText}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        serverStatus = 'online';
        lastSuccessfulConnection = Date.now();
        connectionRetries = 0;
        updateServerStatusIndicator('online');
        
        displayResults(data);
        
    } catch (error) {
        console.error('Prediction error:', error);
        
        let errorMessage = 'Failed to get prediction';
        
        if (error.name === 'AbortError') {
            errorMessage = 'Request timed out. The server may be under heavy load. Please try again.';
            serverStatus = 'offline';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            connectionRetries++;
            errorMessage = `Connection failed. The server may be starting up. Try again in 30 seconds.`;
            serverStatus = 'offline';
        } else if (error.message.includes('CORS')) {
            errorMessage = 'Cross-origin request blocked. Please contact support.';
        } else {
            errorMessage = `Error: ${error.message}`;
        }
        
        updateServerStatusIndicator('offline');
        showError(errorMessage);
    } finally {
        setLoadingState(false);
    }
}

// [Include all your existing display functions...]

function setLoadingState(isLoading) {
    const btnText = predictBtn.querySelector('span');
    const btnSpinner = predictBtn.querySelector('.loading-spinner');
    
    predictBtn.disabled = isLoading;
    btnText.textContent = isLoading ? 'Generating...' : 'Generate Prediction';
    btnSpinner.style.display = isLoading ? 'block' : 'none';
    
    if (isLoading) {
        resultsSection.style.display = 'block';
        chartLoading.style.display = 'flex';
        updateLoadingMessage('Loading AI models...');
        predictionChart.style.display = 'none';
    }
}

function updateLoadingMessage(message) {
    chartLoading.innerHTML = `
        <div class="loading-content">
            <div class="spinner"></div>
            <p>${message}</p>
            <p><small>⚡ Smart timing: Next ping in 14 minutes</small></p>
        </div>
    `;
}

function displayResults(data) {
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
    
    displayChart(data.chart_url);
    displayTable(data.table_data);
    updateSummaryCards(data.table_data);
}

function displayChart(chartUrl) {
    chartLoading.style.display = 'none';
    
    let fullChartUrl = chartUrl;
    
    if (chartUrl.startsWith('/') || !chartUrl.startsWith('http')) {
        const cleanUrl = chartUrl.replace(/^\//, '');
        fullChartUrl = `${API_BASE_URL}/${cleanUrl}`;
    }
    
    predictionChart.src = fullChartUrl;
    predictionChart.style.display = 'block';
    
    predictionChart.onerror = function() {
        showError('Chart temporarily unavailable. Data table is still available below.');
        chartLoading.style.display = 'flex';
        chartLoading.innerHTML = '<p>Chart unavailable</p>';
    };
    
    predictionChart.onload = function() {
        console.log('✅ Chart loaded successfully');
    };
}

function displayTable(tableData) {
    const tbody = resultsTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    tableData.forEach(row => {
        const tr = document.createElement('tr');
        
        const original = parseFloat(row.original) || 0;
        const predicted = parseFloat(row.predicted) || 0;
        const difference = row.difference !== undefined && row.difference !== null ? parseFloat(row.difference) : null;
        
        let changePercent = 'N/A';
        if (original !== 0 && !isNaN(original) && !isNaN(predicted)) {
            changePercent = (((predicted - original) / original) * 100).toFixed(2) + '%';
        }
        
        let differenceDisplay = 'N/A';
        if (difference !== null && !isNaN(difference)) {
            differenceDisplay = difference.toFixed(4);
        }
        
        tr.innerHTML = `
            <td><strong>${row.parameter}</strong></td>
            <td>${parseFloat(row.original).toFixed(4)}</td>
            <td>${parseFloat(row.predicted).toFixed(4)}</td>
            <td class="${getDifferenceClass(difference)}">${differenceDisplay}</td>
            <td class="${getChangeClass(changePercent)}">${changePercent}</td>
        `;
        
        tbody.appendChild(tr);
    });
}

function getDifferenceClass(difference) {
    if (difference === null || difference === undefined || isNaN(difference)) return '';
    const numDiff = parseFloat(difference);
    if (numDiff > 0) return 'positive-change';
    if (numDiff < 0) return 'negative-change';
    return '';
}

function getChangeClass(changePercent) {
    if (changePercent === 'N/A') return '';
    const numChange = parseFloat(changePercent);
    if (numChange > 0) return 'positive-change';
    if (numChange < 0) return 'negative-change';
    return '';
}

function updateSummaryCards(tableData) {
    const socData = tableData.find(row => 
        row.parameter.toLowerCase().includes('soc') || 
        row.parameter.toLowerCase().includes('state of charge')
    );
    
    const cyclesData = tableData.find(row => 
        row.parameter.toLowerCase().includes('cycle') || 
        row.parameter.toLowerCase().includes('charging cycles')
    );
    
    const efficiencyData = tableData.find(row => 
        row.parameter.toLowerCase().includes('efficiency')
    );
    
    const batteryHealthElement = document.getElementById('battery-health');
    const lifespanElement = document.getElementById('predicted-lifespan');
    const efficiencyElement = document.getElementById('efficiency-rating');
    
    if (batteryHealthElement) {
        batteryHealthElement.textContent = socData ? `${parseFloat(socData.predicted).toFixed(1)}%` : 'Good';
    }
    
    if (lifespanElement) {
        lifespanElement.textContent = cyclesData ? `${Math.round(parseFloat(cyclesData.predicted))} cycles` : '5-8 years';
    }
    
    if (efficiencyElement) {
        efficiencyElement.textContent = efficiencyData ? `${parseFloat(efficiencyData.predicted).toFixed(1)}%` : 'A+';
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorModal.style.display = 'flex';
}

function closeErrorModal() {
    errorModal.style.display = 'none';
}

function downloadChart() {
    if (predictionChart.src) {
        const link = document.createElement('a');
        link.href = predictionChart.src;
        link.download = `battery-prediction-chart-${new Date().getTime()}.png`;
        link.click();
    } else {
        showError('No chart available to download');
    }
}

function exportTable() {
    const table = resultsTable;
    let csv = '';
    
    const headers = Array.from(table.querySelectorAll('th')).map(th => 
        th.textContent.replace(/[^\w\s]/gi, '').trim()
    );
    csv += headers.join(',') + '\n';
    
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td')).map(td => {
            return `"${td.textContent.trim().replace(/"/g, '""')}"`;
        });
        csv += cells.join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `battery-prediction-data-${new Date().getTime()}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', function() {
    const downloadChartBtn = document.getElementById('download-chart-btn');
    if (downloadChartBtn) {
        downloadChartBtn.addEventListener('click', downloadChart);
    }
    
    const exportTableBtn = document.getElementById('export-table-btn');
    if (exportTableBtn) {
        exportTableBtn.addEventListener('click', exportTable);
    }
});

const style = document.createElement('style');
style.textContent = `
    .positive-change {
        color: #059669;
        font-weight: 600;
    }
    
    .negative-change {
        color: #dc2626;
        font-weight: 600;
    }
    
    .positive-change::before {
        content: '+';
    }
    
    .loading-content {
        text-align: center;
        padding: 20px;
    }
    
    .spinner {
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
        margin: 0 auto 20px;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    #prediction-chart {
        max-width: 100%;
        height: auto;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }
    
    .chart-loading {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 300px;
        background-color: #f9fafb;
        border-radius: 8px;
        border: 2px dashed #d1d5db;
    }
`;
document.head.appendChild(style);