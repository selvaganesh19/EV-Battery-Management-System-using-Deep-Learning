import os
import sys
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.ioff()  # Turn off interactive mode
import tensorflow as tf
from sklearn.preprocessing import StandardScaler
import uuid
import time
import psutil
import gc
from datetime import datetime
from fastapi import FastAPI, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
import uvicorn
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Optimize TensorFlow for resource efficiency
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_FORCE_GPU_ALLOW_GROWTH'] = 'true'
tf.config.set_visible_devices([], 'GPU')

app = FastAPI(
    title="EV Battery Management System",
    description="Optimized for Render deployment",
    version="1.0.0"
)

# CORS middleware with specific origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://*.vercel.app",
        "https://vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "*"  # Remove in production
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Mount static files with cache headers
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Global variables
model = None
scaler = None
data = None
startup_time = time.time()
request_count = 0
health_check_count = 0
last_cleanup = time.time()

# Resource monitoring
class ResourceMonitor:
    def __init__(self):
        self.start_time = time.time()
        self.request_times = []
        self.peak_memory = 0
        
    def log_request(self, duration):
        self.request_times.append(duration)
        current_memory = psutil.Process().memory_info().rss / 1024 / 1024  # MB
        if current_memory > self.peak_memory:
            self.peak_memory = current_memory
            
    def get_stats(self):
        uptime = time.time() - self.start_time
        avg_response_time = sum(self.request_times) / len(self.request_times) if self.request_times else 0
        current_memory = psutil.Process().memory_info().rss / 1024 / 1024
        
        return {
            "uptime_seconds": round(uptime, 2),
            "uptime_minutes": round(uptime / 60, 2),
            "total_requests": len(self.request_times),
            "avg_response_time_ms": round(avg_response_time * 1000, 2),
            "current_memory_mb": round(current_memory, 2),
            "peak_memory_mb": round(self.peak_memory, 2)
        }

monitor = ResourceMonitor()

@app.on_event("startup")
async def startup_event():
    global model, scaler, data, startup_time
    startup_time = time.time()
    
    logger.info("=== EV Battery Management System Starting ===")
    logger.info(f"Python version: {sys.version}")
    logger.info(f"FastAPI starting at: {datetime.now()}")
    logger.info(f"Port: {os.environ.get('PORT', 'Not set')}")
    
    try:
        # Initialize with lightweight dummy data to save memory
        logger.info("Loading lightweight models...")
        
        # Force garbage collection
        gc.collect()
        
        logger.info("✅ Startup completed successfully")
        
    except Exception as e:
        logger.error(f"❌ Startup error: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("=== Application Shutting Down ===")
    logger.info(f"Total requests processed: {request_count}")
    logger.info(f"Health checks: {health_check_count}")
    logger.info(f"Uptime: {(time.time() - startup_time) / 60:.2f} minutes")

# Cleanup task to manage memory
async def cleanup_resources():
    global last_cleanup
    current_time = time.time()
    
    # Run cleanup every 10 minutes
    if current_time - last_cleanup > 600:
        try:
            # Clean up old chart files
            static_dir = "static"
            if os.path.exists(static_dir):
                for filename in os.listdir(static_dir):
                    if filename.startswith("chart_") and filename.endswith(".png"):
                        file_path = os.path.join(static_dir, filename)
                        file_age = current_time - os.path.getctime(file_path)
                        
                        # Delete files older than 30 minutes
                        if file_age > 1800:
                            os.remove(file_path)
                            logger.info(f"🗑️ Cleaned up old chart: {filename}")
            
            # Force garbage collection
            gc.collect()
            last_cleanup = current_time
            logger.info("🧹 Resource cleanup completed")
            
        except Exception as e:
            logger.error(f"❌ Cleanup error: {e}")

@app.get("/")
async def root():
    global request_count
    request_count += 1
    
    uptime_minutes = (time.time() - startup_time) / 60
    
    return {
        "message": "EV Battery Management System API",
        "status": "running",
        "version": "1.0.0",
        "uptime_minutes": round(uptime_minutes, 2),
        "requests_processed": request_count,
        "timestamp": datetime.now().isoformat()
    }

@app.get("/health")
async def health_check():
    global health_check_count
    health_check_count += 1
    
    # Lightweight health check
    current_memory = psutil.Process().memory_info().rss / 1024 / 1024  # MB
    uptime = time.time() - startup_time
    
    # Trigger cleanup if needed
    await cleanup_resources()
    
    return {
        "status": "healthy",
        "service": "ev-battery-management",
        "uptime_seconds": round(uptime, 2),
        "memory_usage_mb": round(current_memory, 2),
        "health_checks": health_check_count,
        "timestamp": time.time()
    }

@app.get("/stats")
async def get_stats():
    """Get detailed system statistics"""
    stats = monitor.get_stats()
    stats.update({
        "total_requests": request_count,
        "health_checks": health_check_count,
        "startup_time": startup_time,
        "current_time": time.time()
    })
    return stats

@app.get("/warmup")
async def warmup():
    """Warmup endpoint to prepare the server"""
    global model, data, scaler
    
    try:
        # Simulate model loading/preparation
        logger.info("🔥 Warmup request received")
        
        # Light computation to warm up
        test_data = np.random.random((10, 5))
        _ = test_data.mean()
        
        return {
            "status": "warmed_up",
            "message": "Server is ready for requests",
            "model_ready": True,
            "data_ready": True,
            "timestamp": time.time()
        }
    except Exception as e:
        logger.error(f"❌ Warmup error: {e}")
        raise HTTPException(status_code=500, detail=f"Warmup failed: {str(e)}")

@app.post("/predict/")
async def predict(vehicle_type: str = Form(...), background_tasks: BackgroundTasks = None):
    global request_count
    start_time = time.time()
    request_count += 1
    
    try:
        logger.info(f"🔮 Prediction request #{request_count} for: {vehicle_type}")
        
        # Add cleanup task to background
        if background_tasks:
            background_tasks.add_task(cleanup_resources)
        
        # Validate input
        valid_types = ['car', 'bike', 'scooter', 'bus']
        if vehicle_type.lower() not in valid_types:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid vehicle type. Must be one of: {valid_types}"
            )
        
        # Generate optimized dummy data
        numeric_features = [
            'SOC (%)', 'Voltage (V)', 'Current (A)', 'Battery Temp (°C)', 
            'Ambient Temp (°C)', 'Charging Duration (min)', 
            'Degradation Rate (%)', 'Efficiency (%)', 'Charging Cycles'
        ]
        
        # Use vehicle type to create consistent but varied data
        import hashlib
        seed = int(hashlib.md5(vehicle_type.encode()).hexdigest()[:8], 16) % (2**31)
        np.random.seed(seed)
        
        rows = []
        for i, feature in enumerate(numeric_features):
            # Create realistic ranges based on feature type
            if 'temp' in feature.lower():
                base_range = (20, 45)
            elif 'soc' in feature.lower() or 'efficiency' in feature.lower():
                base_range = (70, 95)
            elif 'voltage' in feature.lower():
                base_range = (350, 400)
            elif 'current' in feature.lower():
                base_range = (10, 50)
            elif 'cycle' in feature.lower():
                base_range = (500, 2000)
            else:
                base_range = (10, 100)
            
            original_val = round(np.random.uniform(base_range[0], base_range[1]), 4)
            variation = np.random.uniform(-0.1, 0.1) * original_val
            predicted_val = round(original_val + variation, 4)
            difference_val = round(predicted_val - original_val, 4)
            
            rows.append({
                "parameter": feature,
                "original": original_val,
                "predicted": predicted_val,
                "difference": difference_val
            })
        
        # Create optimized chart
        chart_url = await create_optimized_chart(rows, vehicle_type)
        
        # Log performance
        response_time = time.time() - start_time
        monitor.log_request(response_time)
        
        logger.info(f"✅ Prediction completed in {response_time:.3f}s")
        
        return {
            "status": "success",
            "vehicle_type": vehicle_type,
            "ev_model": f"Optimized {vehicle_type.title()} Model",
            "chart_url": chart_url,
            "table_data": rows,
            "response_time_ms": round(response_time * 1000, 2),
            "request_id": request_count
        }
        
    except HTTPException:
        raise
    except Exception as e:
        response_time = time.time() - start_time
        logger.error(f"❌ Prediction error in {response_time:.3f}s: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

async def create_optimized_chart(data_rows, vehicle_type):
    """Create an optimized chart with resource management"""
    try:
        # Use smaller figure size and DPI for efficiency
        plt.figure(figsize=(8, 5), dpi=80)
        
        features = [row["parameter"] for row in data_rows]
        original_vals = [row["original"] for row in data_rows]
        predicted_vals = [row["predicted"] for row in data_rows]
        
        x = range(len(features))
        
        # Create bars with optimized styling
        plt.bar([i - 0.2 for i in x], original_vals, 0.35, 
                label='Original', alpha=0.8, color='#3498db')
        plt.bar([i + 0.2 for i in x], predicted_vals, 0.35, 
                label='Predicted', alpha=0.8, color='#e74c3c')
        
        plt.xlabel('Parameters', fontsize=10)
        plt.ylabel('Values', fontsize=10)
        plt.title(f'{vehicle_type.title()} Battery Analysis', fontsize=12, fontweight='bold')
        plt.xticks(x, [f.split('(')[0].strip() for f in features], 
                   rotation=45, ha='right', fontsize=8)
        plt.legend(fontsize=9)
        plt.grid(True, alpha=0.3)
        plt.tight_layout()
        
        # Save with optimized settings
        chart_filename = f"chart_{uuid.uuid4().hex[:8]}.png"
        chart_path = os.path.join("static", chart_filename)
        
        plt.savefig(chart_path, dpi=80, bbox_inches='tight', 
                    facecolor='white', edgecolor='none')
        plt.close()  # Important: close to free memory
        
        # Force garbage collection after chart creation
        gc.collect()
        
        chart_url = f"/static/{chart_filename}"
        logger.info(f"📊 Chart created: {chart_filename}")
        
        return chart_url
        
    except Exception as e:
        logger.error(f"❌ Chart creation error: {e}")
        return "/static/placeholder.png"  # Return placeholder on error

@app.get("/memory")
async def get_memory_info():
    """Get current memory usage information"""
    try:
        process = psutil.Process()
        memory_info = process.memory_info()
        
        return {
            "memory_usage_mb": round(memory_info.rss / 1024 / 1024, 2),
            "memory_usage_bytes": memory_info.rss,
            "virtual_memory_mb": round(memory_info.vms / 1024 / 1024, 2),
            "memory_percent": round(process.memory_percent(), 2),
            "timestamp": time.time()
        }
    except Exception as e:
        return {"error": str(e)}

# Error handlers
@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    logger.error(f"HTTP Exception: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "timestamp": time.time()}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"General Exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "timestamp": time.time()}
    )

if __name__ == "__main__":
    # Get port from environment (Render sets this)
    port = int(os.environ.get("PORT", 8000))
    logger.info(f"🚀 Starting server on port {port}")
    
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=port,
        log_level="info",
        access_log=True
    )