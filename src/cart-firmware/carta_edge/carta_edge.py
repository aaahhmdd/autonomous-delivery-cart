import time
import json
import ssl
import threading
import paho.mqtt.client as mqtt

# Try to import Raspberry Pi GPIO (Fails gracefully if testing on a laptop)
try:
    import RPi.GPIO as GPIO
    HARDWARE_MODE = True
except ImportError:
    print("⚠️ RPi.GPIO not found. Running in Cloud-Simulation Mode.")
    HARDWARE_MODE = False

# ==========================================
# ⚙️ CONFIGURATION (Cloud Architect Specs)
# ==========================================
CART_ID = "cart_001"
# The exact AWS IoT Endpoint for your Frankfurt region
AWS_IOT_ENDPOINT = "ajelyhc78s5bv-ats.iot.eu-central-1.amazonaws.com" 
PORT = 8883

# X.509 Certificate Paths (Ensure these files are in a 'certs' folder next to this script)
CA_CERT = "./certs/cart_001/root.pem"
DEVICE_CERT = "./certs/cart_001/certificate.pem.crt"
PRIVATE_KEY = "./certs/cart_001/private.pem.key"

# MQTT Topics
TELEMETRY_TOPIC = f"carta/telemetry/{CART_ID}"
COMMANDS_TOPIC = f"carta/commands/{CART_ID}"

# Hardware Pins (BCM Numbering)
PIN_SOLENOID_LOCK = 18
PIN_MOTOR_KILL_SWITCH = 23

# ==========================================
# 🛠️ HARDWARE SETUP
# ==========================================
if HARDWARE_MODE:
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    # Setup Solenoid Lock (Normally LOW, HIGH to unlock)
    GPIO.setup(PIN_SOLENOID_LOCK, GPIO.OUT, initial=GPIO.LOW)
    # Setup Motor Kill Switch (Normally HIGH, LOW to cut power)
    GPIO.setup(PIN_MOTOR_KILL_SWITCH, GPIO.OUT, initial=GPIO.HIGH)

# ==========================================
# 📡 MQTT CALLBACKS (Listening to the Cloud)
# ==========================================
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"✅ Connected to AWS IoT Core securely! (Cart: {CART_ID})")
        # Subscribe to the commands topic the moment we connect
        client.subscribe(COMMANDS_TOPIC, qos=1)
        print(f"🎧 Listening for Cloud Commands on: {COMMANDS_TOPIC}")
    else:
        print(f"❌ Connection failed with error code {rc}")

def on_message(client, userdata, msg):
    print(f"\n📥 [CLOUD COMMAND RECEIVED] Topic: {msg.topic}")
    try:
        payload = json.loads(msg.payload.decode('utf-8'))
        command = payload.get("command")
        
        # --- COMMAND 1: SECURE HANDOFF (UNLOCK) ---
        if command == "unlock_doors":
            print("🔓 ACTION: Unlocking Cart Doors!")
            if HARDWARE_MODE:
                GPIO.output(PIN_SOLENOID_LOCK, GPIO.HIGH)
                time.sleep(5) # Keep unlocked for 5 seconds
                GPIO.output(PIN_SOLENOID_LOCK, GPIO.LOW)
                print("🔒 ACTION: Doors relocked.")
        
        # --- COMMAND 2: EMERGENCY STOP ---
        elif command == "emergency_stop":
            print("🚨 ACTION: EMERGENCY STOP INITIATED! Cutting motor power!")
            if HARDWARE_MODE:
                GPIO.output(PIN_MOTOR_KILL_SWITCH, GPIO.LOW)
                # Note: Requires manual physical reset or a different command to un-stop

        else:
            print(f"❓ Unknown command received: {command}")

    except json.JSONDecodeError:
        print("❌ Error: Received malformed JSON from cloud.")

# ==========================================
# 🚀 TELEMETRY PUBLISHER (Sending to the Cloud)
# ==========================================
def get_gps_and_battery():
    # TODO FOR HARDWARE TEAM: 
    # Replace these dummy values with actual readings from your GPS/BMS sensors!
    return {
        "latitude": 30.044420,
        "longitude": 31.235712,
        "battery_percentage": 85
    }

def telemetry_loop(client):
    while True:
        sensor_data = get_gps_and_battery()
        
        payload = {
            "cart_id": CART_ID,
            "battery_percentage": sensor_data["battery_percentage"],
            "latitude": sensor_data["latitude"],
            "longitude": sensor_data["longitude"],
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        }
        
        # Publish to AWS IoT Core
        client.publish(TELEMETRY_TOPIC, json.dumps(payload), qos=1)
        print(f"📤 [TELEMETRY SENT] {payload}")
        
        time.sleep(5) # Send updates every 5 seconds

# ==========================================
# 🏁 MAIN EXECUTION
# ==========================================
if __name__ == '__main__':
    # Initialize MQTT Client
    client = mqtt.Client(client_id=CART_ID)

    # Configure TLS/SSL (REQUIRED BY AWS IOT)
    client.tls_set(ca_certs=CA_CERT, 
                   certfile=DEVICE_CERT, 
                   keyfile=PRIVATE_KEY, 
                   cert_reqs=ssl.CERT_REQUIRED, 
                   tls_version=ssl.PROTOCOL_TLSv1_2, 
                   ciphers=None)

    # Attach Callbacks
    client.on_connect = on_connect
    client.on_message = on_message

    # Connect to AWS
    print("⏳ Connecting to AWS IoT Core...")
    try:
        client.connect(AWS_IOT_ENDPOINT, PORT, keepalive=60)
    except Exception as e:
        print(f"❌ Failed to connect to AWS: {e}")
        print("👉 Did you put the AWS Certificates in the /certs folder?")
        exit(1)

    # Start the network loop in the background
    client.loop_start()

    # Start the continuous GPS telemetry in the main thread
    try:
        telemetry_loop(client)
    except KeyboardInterrupt:
        print("\n🛑 Shutting down cart edge software...")
        if HARDWARE_MODE:
            GPIO.cleanup()
        client.loop_stop()
        client.disconnect()