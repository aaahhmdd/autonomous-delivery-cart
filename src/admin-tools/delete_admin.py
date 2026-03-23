import boto3
import config
from botocore.exceptions import ClientError

# Initialize Cognito
client = boto3.client('cognito-idp', region_name=config.REGION)

def delete_user():
    print("--- 🗑️ Delete User from AWS Cognito ---")
    email = input("Enter the Email/Username to delete: ").strip()
    
    # Confirm deletion to prevent accidents
    confirm = input(f"Are you SURE you want to delete '{email}'? (yes/no): ").strip().lower()
    if confirm != 'yes':
        print("Deletion cancelled.")
        return

    try:
        print(f"Deleting '{email}' from AWS Cognito...")
        client.admin_delete_user(
            UserPoolId=config.USER_POOL_ID,
            Username=email
        )
        print(f"✅ Success! User '{email}' has been permanently deleted.")
        print("You can now recreate this user cleanly.")
        
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == 'UserNotFoundException':
            print(f"❌ User '{email}' was not found in Cognito.")
        else:
            print(f"❌ Failed to delete user: {e.response['Error']['Message']}")
    except Exception as e:
        print(f"❌ An unexpected error occurred: {e}")

if __name__ == "__main__":
    delete_user()