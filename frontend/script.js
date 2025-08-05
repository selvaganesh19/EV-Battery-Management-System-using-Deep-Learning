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
    
    if (!['car', 'bike'].includes(vehicleType)) {
        showError('Please enter a valid vehicle type (car or bike).');
        return;
    }
    
    // Show loading state
    setLoadingState(true);
    
    try {
        const formData = new FormData();
        formData.append('vehicle_type', vehicleType);
        
        const response = await fetch('http://127.0.0.1:8000/predict/', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        // Display results
        displayResults(data);
        
    } catch (error) {
        console.error('Prediction error:', error);
        showError(`Failed to get prediction: ${error.message}`);
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
    
    // Fix chart URL
    let fixedUrl = chartUrl;
    if (fixedUrl.startsWith('/')) {
        fixedUrl = fixedUrl.substring(1);
    }
    fixedUrl = `http://127.0.0.1:8000/${fixedUrl}`;
    
    predictionChart.src = fixedUrl;
    predictionChart.style.display = 'block';
    
    // Handle image load error
    predictionChart.onerror = function() {
        showError('Failed to load prediction chart. Please try again.');
        chartLoading.style.display = 'flex';
        chartLoading.innerHTML = '<p>Chart unavailable</p>';
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
        const difference = row.difference !== undefined && row.difference !== null ? row.difference : 'N/A';
        
        let changePercent = 'N/A';
        if (original !== 0 && !isNaN(original) && !isNaN(predicted)) {
            changePercent = (((predicted - original) / original) * 100).toFixed(2) + '%';
        }
        
        tr.innerHTML = `
            <td><strong>${row.parameter}</strong></td>
            <td>${row.original}</td>
            <td>${row.predicted}</td>
            <td class="${getDifferenceClass(difference)}">${difference}</td>
            <td class="${getChangeClass(changePercent)}">${changePercent}</td>
        `;
        
        tbody.appendChild(tr);
    });
}

function getDifferenceClass(difference) {
    if (difference === 'N/A') return '';
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
    const batteryHealthData = tableData.find(row => 
        row.parameter.toLowerCase().includes('health') || 
        row.parameter.toLowerCase().includes('capacity')
    );
    
    const lifespanData = tableData.find(row => 
        row.parameter.toLowerCase().includes('life') || 
        row.parameter.toLowerCase().includes('cycle')
    );
    
    const efficiencyData = tableData.find(row => 
        row.parameter.toLowerCase().includes('efficiency') || 
        row.parameter.toLowerCase().includes('performance')
    );
    
    // Update cards
    document.getElementById('battery-health').textContent = 
        batteryHealthData ? `${batteryHealthData.predicted}` : 'Good';
    
    document.getElementById('predicted-lifespan').textContent = 
        lifespanData ? `${lifespanData.predicted}` : '5-8 years';
    
    document.getElementById('efficiency-rating').textContent = 
        efficiencyData ? `${efficiencyData.predicted}` : 'A+';
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
    const link = document.createElement('a');
    link.href = predictionChart.src;
    link.download = 'battery-prediction-chart.png';
    link.click();
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
        const cells = Array.from(row.querySelectorAll('td')).map(td => 
            td.textContent.trim()
        );
        csv += cells.join(',') + '\n';
    });
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'battery-prediction-data.csv';
    link.click();
    window.URL.revokeObjectURL(url);
}

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
`;
document.head.appendChild(style);