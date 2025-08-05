from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import pandas as pd
import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model
from sklearn.preprocessing import MinMaxScaler, LabelEncoder
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import uuid
import os
import warnings

# Suppress TensorFlow logs
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
warnings.filterwarnings('ignore')

app = FastAPI(title="EV Battery Management System")

# Create static directory if it doesn't exist
os.makedirs("static", exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables for data and models
data = None
label_encoders = {}
scaler = None
model = None
numeric_features = []

@app.on_event("startup")
async def startup_event():
    global data, label_encoders, scaler, model, numeric_features
    
    try:
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
                break
        
        if csv_file is None:
            raise FileNotFoundError("ev_battery_charging_data.csv not found in any expected location")
        
        # Find model file
        model_file = None
        for path in model_paths:
            if os.path.exists(path):
                model_file = path
                break
        
        if model_file is None:
            raise FileNotFoundError("ev_bms_colab_model.h5 not found in any expected location")
        
        print(f"Loading CSV from: {csv_file}")
        print(f"Loading model from: {model_file}")
        
        # Load dataset
        data = pd.read_csv(csv_file)
        data.dropna(inplace=True)

        # Categorical encoders
        categorical_columns = ['Charging Mode', 'Battery Type', 'EV Model']
        
        # Check if categorical columns exist
        missing_cols = [col for col in categorical_columns if col not in data.columns]
        if missing_cols:
            raise ValueError(f"Missing columns in dataset: {missing_cols}")
        
        label_encoders = {col: LabelEncoder().fit(data[col]) for col in categorical_columns}
        for col in categorical_columns:
            data[col] = label_encoders[col].transform(data[col])

        exclude_cols = categorical_columns + ['Optimal Charging Duration Class']
        numeric_features = [col for col in data.columns if col not in exclude_cols]

        # Scale features
        scaler = MinMaxScaler()
        data[numeric_features] = scaler.fit_transform(data[numeric_features])

        # Load model
        model = load_model(model_file, compile=False)
        
        print("Startup completed successfully!")
        
    except Exception as e:
        print(f"Startup error: {str(e)}")
        raise

# Vehicle type to model name
vehicle_type_to_model = {
    "car": "Model A",
    "bike": "Model B", 
    "scooter": "Model C",
    "bus": "Model D"
}

@app.get("/")
async def root():
    return {"message": "EV Battery Management System API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/image/{filename}")
async def get_image(filename: str):
    """Serve images from static directory"""
    file_path = os.path.join("static", filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="Image not found")

@app.post("/predict/")
async def predict(vehicle_type: str = Form(...)):
    try:
        if model is None or scaler is None or data is None:
            raise HTTPException(status_code=500, detail="Model not loaded properly")
        
        ev_model = vehicle_type_to_model.get(vehicle_type.lower())
        if not ev_model:
            raise HTTPException(status_code=400, detail=f"Invalid vehicle type. Valid types: {list(vehicle_type_to_model.keys())}")

        # Find CSV file for original data
        csv_paths = [
            "ev_battery_charging_data.csv",
            "../ev_battery_charging_data.csv",
            os.path.join(os.path.dirname(__file__), "ev_battery_charging_data.csv"),
            os.path.join(os.path.dirname(__file__), "..", "ev_battery_charging_data.csv")
        ]
        
        csv_file = None
        for path in csv_paths:
            if os.path.exists(path):
                csv_file = path
                break
        
        if csv_file is None:
            raise HTTPException(status_code=500, detail="CSV file not found")
        
        # Load original data for filtering
        original_data = pd.read_csv(csv_file)
        filtered = original_data[original_data["EV Model"] == ev_model]

        if filtered.empty:
            raise HTTPException(status_code=404, detail=f"No data found for model: {ev_model}")

        # Get input record
        input_record = filtered[numeric_features].mean().to_frame().T
        input_scaled = scaler.transform(input_record)
        input_scaled = input_scaled.reshape((1, input_scaled.shape[1], 1))

        # Make prediction
        prediction_scaled = model.predict(input_scaled, verbose=0)
        prediction = scaler.inverse_transform(prediction_scaled).flatten()
        original = input_record.values.flatten()

        # Generate plot with better styling
        plt.figure(figsize=(14, 8))
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
        
        # Create absolute path for static directory
        static_dir = os.path.abspath("static")
        if not os.path.exists(static_dir):
            os.makedirs(static_dir)
            
        plot_filename = f"{uuid.uuid4().hex}.png"
        plot_path = os.path.join(static_dir, plot_filename)
        
        # Save plot
        plt.savefig(plot_path, dpi=150, bbox_inches='tight', facecolor='white')
        plt.close()
        
        print(f"Plot saved to: {plot_path}")
        print(f"File exists: {os.path.exists(plot_path)}")

        # Prepare table data with explicit difference calculation
        rows = []
        for i, col in enumerate(numeric_features):
            original_val = float(original[i])
            predicted_val = float(prediction[i])
            difference_val = predicted_val - original_val
            
            rows.append({
                "parameter": col,
                "original": round(original_val, 4),
                "predicted": round(predicted_val, 4),
                "difference": round(difference_val, 4)  # Explicitly calculate difference
            })

        # Debug: Print the data being returned
        print("Table data being returned:")
        for row in rows:
            print(f"{row['parameter']}: Original={row['original']}, Predicted={row['predicted']}, Difference={row['difference']}")

        return {
            "status": "success",
            "vehicle_type": vehicle_type,
            "ev_model": ev_model,
            "chart_url": f"/static/{plot_filename}",
            "table_data": rows
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")

@app.get("/vehicle-types")
async def get_vehicle_types():
    return {"vehicle_types": list(vehicle_type_to_model.keys())}
