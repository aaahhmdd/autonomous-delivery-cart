import boto3
import config

# Initialize AWS Cognito Client
cognito = boto3.client('cognito-idp', region_name=config.REGION)

def delete_user():
    print("--- CARTA User Deletion Tool ---")
    username = input("Enter the Username to delete (e.g. market_compound_a): ").strip()
    
    if not username:
        print("Operation cancelled.")
        return

    confirm = input(f"Are you sure you want to PERMANENTLY delete '{username}'? (y/n): ")
    if confirm.lower() != 'y':
        print("Operation cancelled.")
        return

    try:
        cognito.admin_delete_user(
            UserPoolId=config.USER_POOL_ID,
            Username=username
        )
        print(f"✅ Successfully deleted user: {username}")
        print("You can now run create_vendor.py again.")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    delete_user()