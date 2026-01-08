import boto3
import config

# Initialize Cognito
cognito = boto3.client('cognito-idp', region_name=config.REGION)

def force_confirm():
    print("--- 🔓 CARTA User Force-Confirm Tool ---")
    username = input("Enter Username to confirm (e.g. market_a): ").strip()
    
    if not username: return

    try:
        cognito.admin_confirm_sign_up(
            UserPoolId=config.USER_POOL_ID,
            Username=username
        )
        print(f"✅ Successfully confirmed user: {username}")
        print("Try logging in now.")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    force_confirm()