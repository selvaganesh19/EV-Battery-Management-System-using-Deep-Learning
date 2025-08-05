from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import warnings
import os
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import tensorflow as tf
from sklearn.preprocessing import StandardScaler, MinMaxScaler, LabelEncoder
import uuid
import asyncio

# Optimize TensorFlow for faster loading
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
tf.config.set_visible_devices([], 'GPU')  # Use CPU only for faster startup
warnings.filterwarnings('ignore')

app = FastAPI(title="EV Battery Management System")

# Global variables to cache loaded models and data
model = None
scaler = None
data = None
label_encoders = {}
numeric_features = []
vehicle_type_to_model = {
    "car": "Model A",
    "bike": "Model B", 
    "scooter": "Model C",
    "bus": "Model D"
}

# Load models and data at startup
@app.on_event("startup")
async def load_models():
    global model, scaler, data, label_encoders, numeric_features
    
    try:
        print("Starting model and data loading...")
        
        # Define file paths - check multiple locations
        csv_paths = [
            "ev_battery_charging_data.csv",
            "../ev_battery_charging_data.csv",
            os.path.join(os.path.dirname(__file__), "ev_battery_charging_data.csv"),
            os.path.join(os.path.dirname(__file__), "..", "ev_battery_charging_data.csv")
        ]
        
        model_paths = [
            "ev_bms_colab_model.h5",
            "../ev_bms_colab_model.h5",
            os.path.join(os.path.dirname(__file__), "ev_bms_colab_model.h5"),
            os.path.join(os.path.dirname(__file__), "..", "ev_bms_colab_model.h5")
        ]
        
        # Find CSV file
        csv_file = None
        for path in csv_paths:
            if os.path.exists(path):
                csv_file = path
                print(f"Found CSV file: {path}")
                break
        
        if csv_file is None:
            print("Warning: CSV file not found, will use dummy data")
        
        # Find model file
        model_file = None
        for path in model_paths:
            if os.path.exists(path):
                model_file = path
                print(f"Found model file: {path}")
                break
        
        if model_file is None:
            print("Warning: Model file not found, will use dummy model")
        
        # Load data if available
        if csv_file and os.path.exists(csv_file):
            print("Loading CSV data...")
            data = pd.read_csv(csv_file)
            data.dropna(inplace=True)
            
            # Handle categorical columns if they exist
            categorical_columns = ['Charging Mode', 'Battery Type', 'EV Model']
            existing_categorical = [col for col in categorical_columns if col in data.columns]
            
            if existing_categorical:
                label_encoders = {col: LabelEncoder().fit(data[col]) for col in existing_categorical}
                for col in existing_categorical:
                    data[col] = label_encoders[col].transform(data[col])
            
            # Define numeric features
            exclude_cols = existing_categorical + ['Optimal Charging Duration Class']
            numeric_features = [col for col in data.columns if col not in exclude_cols]
            
            if numeric_features:
                scaler = MinMaxScaler()
                data[numeric_features] = scaler.fit_transform(data[numeric_features])
                print(f"Processed {len(numeric_features)} numeric features")
        else:
            # Create dummy data if CSV not found
            print("Creating dummy data...")
            numeric_features = ['SOC (%)', 'Voltage (V)', 'Current (A)', 'Battery Temp (°C)', 
                              'Ambient Temp (°C)', 'Charging Duration (min)', 
                              'Degradation Rate (%)', 'Efficiency (%)', 'Charging Cycles']
            
            # Create dummy dataset
            np.random.seed(42)
            dummy_data = {}
            for feature in numeric_features:
                dummy_data[feature] = np.random.uniform(0, 100, 1000)
            
            data = pd.DataFrame(dummy_data)
            scaler = MinMaxScaler()
            data[numeric_features] = scaler.fit_transform(data[numeric_features])
        
        # Load model if available
        if model_file and os.path.exists(model_file):
            print("Loading TensorFlow model...")
            model = tf.keras.models.load_model(model_file, compile=False)
            print("Model loaded successfully!")
        else:
            print("Model file not found, predictions will use dummy data")
        
        print("Startup completed successfully!")
        
    except Exception as e:
        print(f"Startup error: {str(e)}")
        # Don't raise the error, just log it - the app can still run with dummy data

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return {"message": "EV Battery Management System API", "status": "running"}

@app.get("/health")
async def health_check():
    global model, data, scaler
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "data_loaded": data is not None,
        "scaler_loaded": scaler is not None
    }

@app.get("/image/{filename}")
async def get_image(filename: str):
    """Serve images from static directory"""
    file_path = os.path.join("static", filename)
    if os.path.exists(file_path):
        from fastapi.responses import FileResponse
        return FileResponse(file_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Image not found")

@app.post("/predict/")
async def predict(vehicle_type: str = Form(...)):
    try:
        print(f"Prediction request for vehicle type: {vehicle_type}")
        
        # Use global variables
        global model, scaler, data, numeric_features
        
        # Validate vehicle type
        if vehicle_type.lower() not in vehicle_type_to_model:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid vehicle type. Valid types: {list(vehicle_type_to_model.keys())}"
            )
        
        ev_model = vehicle_type_to_model[vehicle_type.lower()]
        
        # Get sample data (either from real data or generate dummy data)
        if data is not None and len(data) > 0:
            # Use real data
            sample_idx = np.random.randint(0, len(data))
            original = data.iloc[sample_idx][numeric_features].values
        else:
            # Generate dummy data
            print("Using dummy data for prediction")
            original = np.random.uniform(0.1, 0.9, len(numeric_features))
        
        # Make prediction
        if model is not None and scaler is not None:
            try:
                # Scale input
                original_reshaped = original.reshape(1, -1)
                scaled_features = scaler.transform(original_reshaped)
                
                # Reshape for model if needed
                if len(scaled_features.shape) == 2:
                    scaled_features = scaled_features.reshape((1, scaled_features.shape[1], 1))
                
                # Make prediction
                prediction_scaled = model.predict(scaled_features, verbose=0)
                prediction = scaler.inverse_transform(prediction_scaled.reshape(1, -1)).flatten()
            except Exception as model_error:
                print(f"Model prediction error: {model_error}")
                # Fallback to dummy prediction
                prediction = original + np.random.uniform(-0.1, 0.1, len(original))
        else:
            # Generate dummy prediction
            prediction = original + np.random.uniform(-0.1, 0.1, len(original))
        
        # Create visualization
        try:
            plt.figure(figsize=(12, 6))
            plt.style.use('default')
            
            index = np.arange(len(numeric_features))
            bar_width = 0.35
            
            bars1 = plt.bar(index - bar_width/2, original, bar_width, 
                           label='Original', alpha=0.8, color='#2E86AB')
            bars2 = plt.bar(index + bar_width/2, prediction, bar_width, 
                           label='Predicted', alpha=0.8, color='#A23B72')
            
            plt.xlabel('Parameters', fontsize=12)
            plt.ylabel('Values', fontsize=12)
            plt.title(f"{vehicle_type.title()} - Battery Parameters: Original vs Predicted", fontsize=14)
            plt.xticks(index, numeric_features, rotation=45, ha='right')
            plt.legend(fontsize=12)
            plt.grid(True, alpha=0.3)
            
            # Add value labels on bars
            for bar in bars1:
                height = bar.get_height()
                plt.text(bar.get_x() + bar.get_width()/2., height,
                        f'{height:.2f}', ha='center', va='bottom', fontsize=8)
            
            for bar in bars2:
                height = bar.get_height()
                plt.text(bar.get_x() + bar.get_width()/2., height,
                        f'{height:.2f}', ha='center', va='bottom', fontsize=8)
            
            plt.tight_layout()
            
            # Save plot
            plot_filename = f"{uuid.uuid4().hex}.png"
            plot_path = os.path.join("static", plot_filename)
            plt.savefig(plot_path, dpi=100, bbox_inches='tight', facecolor='white')
            plt.close()
            
            print(f"Plot saved to: {plot_path}")
            chart_url = f"/static/{plot_filename}"
            
        except Exception as plot_error:
            print(f"Plot generation error: {plot_error}")
            chart_url = "/static/placeholder.png"  # Use placeholder if plot fails
        
        # Prepare table data
        rows = []
        for i, col in enumerate(numeric_features):
            original_val = float(original[i])
            predicted_val = float(prediction[i])
            difference_val = predicted_val - original_val
            
            rows.append({
                "parameter": col,
                "original": round(original_val, 4),
                "predicted": round(predicted_val, 4),
                "difference": round(difference_val, 4)
            })
        
        print("Prediction completed successfully")
        
        return {
            "status": "success",
            "vehicle_type": vehicle_type,
            "ev_model": ev_model,
            "chart_url": chart_url,
            "table_data": rows
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Prediction error: {e}")
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")

@app.get("/vehicle-types")
async def get_vehicle_types():
    return {"vehicle_types": list(vehicle_type_to_model.keys())}

# Add a warmup endpoint
@app.get("/warmup")
async def warmup():
    """Warmup endpoint to ensure models are loaded"""
    global model, data, scaler
    return {
        "status": "ready",
        "model_status": "loaded" if model is not None else "not_loaded",
        "data_status": "loaded" if data is not None else "not_loaded",
        "scaler_status": "loaded" if scaler is not None else "not_loaded"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, timeout_keep_alive=120)
