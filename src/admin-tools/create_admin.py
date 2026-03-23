import boto3
import requests
import time
import random
import config

# Initialize Cognito
client = boto3.client('cognito-idp', region_name=config.REGION)

def create_admin():
    print("--- 🛡️ Create System Admin (Cognito + Database) ---")
    email = input("Admin Email (e.g., admin@carta.com): ").strip()
    password = input("Admin Password (e.g., AdminPass123!): ").strip()
    name = input("Admin Name: ").strip()
    
    try:
        # 1. Create the user in AWS Cognito
        print("\n[1/4] Creating user in AWS Cognito...")
        client.admin_create_user(
            UserPoolId=config.USER_POOL_ID,
            Username=email,
            TemporaryPassword=password,
            UserAttributes=[
                {'Name': 'email', 'Value': email},
                {'Name': 'email_verified', 'Value': 'true'},
                {'Name': 'name', 'Value': name}
            ],
            MessageAction='SUPPRESS' # Prevents sending the default email
        )
        
        # 2. Set permanent password immediately
        print("[2/4] Setting permanent password...")
        client.admin_set_user_password(
            UserPoolId=config.USER_POOL_ID,
            Username=email,
            Password=password,
            Permanent=True
        )
        
        # 3. Log In to get the JWT Token
        print("[3/4] Authenticating to get security token...")
        time.sleep(2) # Brief pause to let AWS sync the new password
        auth = client.initiate_auth(
            ClientId=config.CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={'USERNAME': email, 'PASSWORD': password}
        )
        token = auth['AuthenticationResult']['IdToken']
        
        # 4. Create Database Profile via your API
        print("[4/4] Creating Admin Profile in RDS Database...")
        
        # FIX 1: Generate a random phone number to prevent unique constraint crashes
        random_phone = f"+2010{random.randint(1000000, 9999999)}"
        
        payload = {
            "name": name,
            "phone_number": random_phone,
            "default_delivery_address": "System HQ",
            "compound": "Global Admin",
            "role": "customer" # FIX 2: Use an accepted enum value so PostgreSQL doesn't crash!
        }
        
        headers = {'Authorization': token, 'Content-Type': 'application/json'}
        res = requests.post(f"{config.API_URL}/users/me", json=payload, headers=headers)
        
        if res.status_code in [200, 201]:
            print(f"\n✅ Success! Admin account '{email}' is fully configured in Cognito and the Database.")
            print("You can now log in to the Manager Dashboard!")
        else:
            print(f"\n⚠️ Cognito succeeded, but DB profile failed: {res.text}")
            
    except Exception as e:
        print(f"\n❌ Failed: {e}")

if __name__ == "__main__":
    create_admin()