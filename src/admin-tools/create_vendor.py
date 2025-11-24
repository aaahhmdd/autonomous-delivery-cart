import boto3
import requests
import json
import sys
from botocore.exceptions import ClientError
import config  # Imports your IDs from config.py
import getpass

# Initialize AWS Cognito Client
cognito = boto3.client('cognito-idp', region_name=config.REGION)

def create_vendor_account():
    print("--- CARTA Vendor Onboarding Tool ---")
    
    # 1. Collect Info
    username = input("Enter Vendor Username (e.g. market_a): ").strip()
    # hide password input
    password = getpass.getpass("Enter Password (e.g. Pass123!): ").strip()
    email = input("Enter Vendor Email: ").strip()
    phone = input("Enter Vendor Phone (+20...): ").strip()
    
    print("\n--- Shop Details ---")
    shop_name = input("Shop Display Name (Must contain 'Vendor'): ").strip()
    compound = input("Compound Name (e.g. 'Palm Hills'): ").strip()
    address = input("Shop Address: ").strip()

    # Validation for the "Dev Trick"
    if "vendor" not in shop_name.lower():
        print("❌ ERROR: Shop Name MUST contain the word 'Vendor' (case-insensitive) to get correct permissions.")
        return

    try:
        # 2. Create User in Cognito
        print(f"\nCreating user '{username}' in Cognito...")
        cognito.sign_up(
            ClientId=config.CLIENT_ID,
            Username=username,
            Password=password,
            UserAttributes=[
                {'Name': 'email', 'Value': email},
                {'Name': 'name', 'Value': shop_name},
                {'Name': 'phone_number', 'Value': phone}
            ]
        )
        print("✅ User created.")

        # 3. Admin Confirm (Skip Email Verification)
        print("Auto-confirming user...")
        cognito.admin_confirm_sign_up(
            UserPoolId=config.USER_POOL_ID,
            Username=username
        )
        print("✅ User auto-confirmed.")

        # 4. Log In to get Token (Simulating the App)
        print("Logging in to generate DB profile...")
        auth_resp = cognito.initiate_auth(
            ClientId=config.CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                'USERNAME': username,
                'PASSWORD': password
            }
        )
        id_token = auth_resp['AuthenticationResult']['IdToken']

        # 5. Call API to Create DB Profile (with Compound!)
        print("Creating Database Profile with Compound info...")
        url = f"{config.API_URL}/users/me"  # Construct URL
        print(f"DEBUG: POSTing to {url}")   # Print it to check for double slashes

        api_payload = {
            "name": shop_name,
            "phone_number": phone,
            "default_delivery_address": address,
            "compound": compound,
            "shop_image_url": "https://example.com/default-logo.png"
        }
        
        headers = {'Authorization': id_token}
        response = requests.post(url, json=api_payload, headers=headers)

        if response.status_code in [200, 201]:
            print("\n🎉 SUCCESS! Vendor Registered Successfully.")
            print(f"   Username: {username}")
            print(f"   Compound: {compound}")
            print(f"   Role:     {response.json().get('role')}")
        else:
            print(f"\n❌ Database Error: {response.status_code}")
            print(response.text)

    except ClientError as e:
        code = e.response.get('Error', {}).get('Code', '')
        if code == 'UsernameExistsException':
            print("❌ Error: Username already exists.")
        else:
            print(f"❌ AWS Error: {e}")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    create_vendor_account()
