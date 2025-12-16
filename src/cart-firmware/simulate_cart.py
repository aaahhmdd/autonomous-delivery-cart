import time
import json
import sys
import os
from AWSIoTPythonSDK.MQTTLib import AWSIoTMQTTClient

# --- Configuration ---
CART_ID = input("Enter Cart ID to simulate (e.g. cart_001): ").strip()
CERT_PATH = f"../admin-tools/certs/{CART_ID}"

# Check if keys exist
if not os.path.exists(CERT_PATH):
    print(f"❌ Error: Certificates for {CART_ID} not found.")
    print("Run 'admin-tools/provision_cart.py' first.")
    sys.exit()

# Load Config
with open(f"{CERT_PATH}/cart_config.json") as f:
    config = json.load(f)

print(f"📡 Initializing IoT Client for {CART_ID}...")

# Init MQTT Client
myMQTTClient = AWSIoTMQTTClient(CART_ID)
myMQTTClient.configureEndpoint(config['endpoint'], 8883)
myMQTTClient.configureCredentials(
    f"{CERT_PATH}/root.pem",
    f"{CERT_PATH}/private.pem.key",
    f"{CERT_PATH}/certificate.pem.crt"
)

# Connect
print(f"Connecting to AWS ({config['endpoint']})...")
myMQTTClient.connect()
print("✅ Connected!")

# --- Simulation Loop ---
lat = 30.0444 # Starting Lat (Cairo)
lon = 31.2357 # Starting Lon
battery = 100

try:
    while True:
        # Create Data Packet
        payload = {
            "cart_id": CART_ID,
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "battery": battery,
            "status": "delivering"
        }
        
        # Publish to AWS
        myMQTTClient.publish(config['topic'], json.dumps(payload), 1)
        print(f"📤 Sent Telemetry: {json.dumps(payload)}")
        
        # Simulate Movement
        lat += 0.0001
        lon += 0.0001
        if battery > 0: battery -= 1
        
        time.sleep(5) # Send every 5 seconds

except KeyboardInterrupt:
    print("\n🛑 Simulation Stopped.")
    myMQTTClient.disconnect()