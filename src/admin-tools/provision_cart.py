import boto3
import json
import os
import requests
import config # Uses your existing config.py

# Initialize AWS IoT Client
iot = boto3.client('iot', region_name=config.REGION)

def create_cart_thing(cart_id):
    print(f"\n--- 🛒 Provisioning Cart: {cart_id} ---")
    
    # 1. Create the "Thing" in AWS IoT Registry
    try:
        iot.create_thing(thingName=cart_id)
        print(f"✅ Thing '{cart_id}' created/verified.")
    except Exception as e:
        print(f"⚠️ Error creating thing: {e}")

    # 2. Generate Security Certificates (Keys)
    print("🔑 Generating secure keys & certificate...")
    keys_response = iot.create_keys_and_certificate(setAsActive=True)
    cert_arn = keys_response['certificateArn']
    cert_pem = keys_response['certificatePem']
    key_private = keys_response['keyPair']['PrivateKey']
    key_public = keys_response['keyPair']['PublicKey']
    
    # 3. Create/Attach a Security Policy
    # This policy allows the cart to Connect, Publish, and Subscribe
    policy_name = "Cart_IoT_Policy"
    policy_doc = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Action": "iot:*",
            "Resource": "*"
        }]
    }
    
    try:
        iot.create_policy(policyName=policy_name, policyDocument=json.dumps(policy_doc))
    except:
        pass # Policy likely exists already
    
    iot.attach_policy(policyName=policy_name, target=cert_arn)
    iot.attach_thing_principal(thingName=cart_id, principal=cert_arn)
    print("✅ Policy & Certificate attached to Thing.")

    # 4. Save Files Locally
    # You will copy this folder to the physical cart later
    folder = f"certs/{cart_id}"
    os.makedirs(folder, exist_ok=True)
    
    with open(f"{folder}/certificate.pem.crt", "w") as f: f.write(cert_pem)
    with open(f"{folder}/private.pem.key", "w") as f: f.write(key_private)
    with open(f"{folder}/public.pem.key", "w") as f: f.write(key_public)
    
    # Download Root CA (Required for AWS TLS connection)
    print("⬇️  Downloading AWS Root CA...")
    root_ca = requests.get("https://www.amazontrust.com/repository/AmazonRootCA1.pem").text
    with open(f"{folder}/root.pem", "w") as f: f.write(root_ca)

    # 5. Get the IoT Endpoint URL
    endpoint = iot.describe_endpoint(endpointType='iot:Data-ATS')['endpointAddress']
    
    # Create a config file for the cart script
    cart_config = {
        "endpoint": endpoint,
        "cart_id": cart_id,
        "topic": f"carts/{cart_id}/telemetry"
    }
    with open(f"{folder}/cart_config.json", "w") as f:
        json.dump(cart_config, f, indent=2)

    print(f"\n🎉 SUCCESS! Cart '{cart_id}' is ready.")
    print(f"📂 Config & Keys saved to: {folder}/")

if __name__ == "__main__":
    c_id = input("Enter Cart ID (e.g. cart_001): ").strip()
    if c_id:
        create_cart_thing(c_id)