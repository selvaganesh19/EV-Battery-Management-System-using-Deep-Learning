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

// Configuration
const API_BASE_URL = 'https://evbackend-fsw9.onrender.com';

// State
let currentInputMethod = 'dropdown';

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    updateInputMethod('dropdown');
});

function setupEventListeners() {
    // Input method toggle
    dropdownBtn.addEventListener('click', () => updateInputMethod('dropdown'));
    manualBtn.addEventListener('click', () => updateInputMethod('manual'));
    
    // Form submission
    predictForm.addEventListener('submit', handleFormSubmit);
    
    // Close modal on outside click
    errorModal.addEventListener('click', function(e) {
        if (e.target === errorModal) {
            closeErrorModal();
        }
    });
}

function updateInputMethod(method) {
    currentInputMethod = method;
    
    // Update button states
    dropdownBtn.classList.toggle('active', method === 'dropdown');
    manualBtn.classList.toggle('active', method === 'manual');
    
    // Show/hide sections
    dropdownSection.style.display = method === 'dropdown' ? 'block' : 'none';
    manualSection.style.display = method === 'manual' ? 'block' : 'none';
    
    // Clear previous selections
    document.getElementById('vehicle-select').value = '';
    document.getElementById('vehicle-input').value = '';
}

async function handleFormSubmit(e) {
    e.preventDefault();
    
    // Get vehicle type based on input method
    let vehicleType = '';
    if (currentInputMethod === 'dropdown') {
        vehicleType = document.getElementById('vehicle-select').value;
    } else {
        vehicleType = document.getElementById('vehicle-input').value.toLowerCase().trim();
    }
    
    // Validation
    if (!vehicleType) {
        showError('Please select or enter a vehicle type.');
        return;
    }
    
    if (!['car', 'bike', 'scooter', 'bus'].includes(vehicleType)) {
        showError('Please enter a valid vehicle type (car, bike, scooter, or bus).');
        return;
    }
    
    // Show loading state
    setLoadingState(true);
    
    try {
        const formData = new FormData();
        formData.append('vehicle_type', vehicleType);
        
        // Increase timeout to 60 seconds for model loading
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
        
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
        
        // Display results
        displayResults(data);
        
    } catch (error) {
        console.error('Prediction error:', error);
        
        let errorMessage = 'Failed to get prediction';
        if (error.name === 'AbortError') {
            errorMessage = 'Request timed out. The model is taking longer than expected. Please try again.';
        } else if (error.message.includes('Failed to fetch')) {
            errorMessage = 'Cannot connect to server. Please check if the backend is running.';
        } else {
            errorMessage = `Error: ${error.message}`;
        }
        
        showError(errorMessage);
    } finally {
        setLoadingState(false);
    }
}

function setLoadingState(isLoading) {
    const btnText = predictBtn.querySelector('span');
    const btnSpinner = predictBtn.querySelector('.loading-spinner');
    
    predictBtn.disabled = isLoading;
    btnText.textContent = isLoading ? 'Generating...' : 'Generate Prediction';
    btnSpinner.style.display = isLoading ? 'block' : 'none';
    
    if (isLoading) {
        resultsSection.style.display = 'block';
        chartLoading.style.display = 'flex';
        predictionChart.style.display = 'none';
    }
}

function displayResults(data) {
    // Show results section
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
    
    // Display chart
    displayChart(data.chart_url);
    
    // Display table data
    displayTable(data.table_data);
    
    // Update summary cards
    updateSummaryCards(data.table_data);
}

function displayChart(chartUrl) {
    chartLoading.style.display = 'none';
    
    // Construct the full URL for the chart
    let fullChartUrl = chartUrl;
    
    // If it's a relative URL, make it absolute
    if (chartUrl.startsWith('/') || !chartUrl.startsWith('http')) {
        // Remove leading slash if present and construct full URL
        const cleanUrl = chartUrl.replace(/^\//, '');
        fullChartUrl = `${API_BASE_URL}/${cleanUrl}`;
    }
    
    console.log('Original chart URL:', chartUrl);
    console.log('Full chart URL:', fullChartUrl);
    
    predictionChart.src = fullChartUrl;
    predictionChart.style.display = 'block';
    
    // Handle image load error
    predictionChart.onerror = function() {
        console.error('Failed to load image:', fullChartUrl);
        showError('Failed to load prediction chart. Please try again.');
        chartLoading.style.display = 'flex';
        chartLoading.innerHTML = '<p>Chart unavailable</p>';
    };
    
    // Handle successful load
    predictionChart.onload = function() {
        console.log('Chart loaded successfully!');
    };
}

function displayTable(tableData) {
    const tbody = resultsTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    tableData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Calculate percentage change
        const original = parseFloat(row.original) || 0;
        const predicted = parseFloat(row.predicted) || 0;
        const difference = row.difference !== undefined && row.difference !== null ? parseFloat(row.difference) : null;
        
        let changePercent = 'N/A';
        if (original !== 0 && !isNaN(original) && !isNaN(predicted)) {
            changePercent = (((predicted - original) / original) * 100).toFixed(2) + '%';
        }
        
        // Format difference display
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
    // Extract key metrics from table data
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
    
    // Update cards with actual data or fallback values
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

// Utility functions
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
    
    // Headers
    const headers = Array.from(table.querySelectorAll('th')).map(th => 
        th.textContent.replace(/[^\w\s]/gi, '').trim()
    );
    csv += headers.join(',') + '\n';
    
    // Rows
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td')).map(td => {
            // Clean the text content and remove any special characters for CSV
            return `"${td.textContent.trim().replace(/"/g, '""')}"`;
        });
        csv += cells.join(',') + '\n';
    });
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `battery-prediction-data-${new Date().getTime()}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
}

// Add event listeners for utility functions
document.addEventListener('DOMContentLoaded', function() {
    // Add download chart button listener if it exists
    const downloadChartBtn = document.getElementById('download-chart-btn');
    if (downloadChartBtn) {
        downloadChartBtn.addEventListener('click', downloadChart);
    }
    
    // Add export table button listener if it exists
    const exportTableBtn = document.getElementById('export-table-btn');
    if (exportTableBtn) {
        exportTableBtn.addEventListener('click', exportTable);
    }
});

// Add CSS for change indicators
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
    
    .negative-change::before {
        content: '';
    }
    
    /* Additional styles for better visual feedback */
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