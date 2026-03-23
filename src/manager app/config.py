# AWS Configuration
# Replace these with your REAL outputs from 'cdk deploy'

API_BASE_URL = "https://tvdboyoxti.execute-api.me-south-1.amazonaws.com/prod" # No trailing slash
COGNITO_CLIENT_ID = "ve8d0lmgfgdqshb4uphr5g8gj"  # UserPoolClientId
COGNITO_REGION = "me-south-1"

# Note: Streamlit doesn't need the User Pool ID for simple SRP auth if we use boto3, 
# but it's good to have if we expand.

# --- DIRECT DATABASE CONNECTION (For Analytics) ---
DB_HOST = 'localhost'       # Keep this as localhost if using the SSM Tunnel!
DB_PORT = '5432'
DB_NAME = 'deliverydb'
DB_USER = 'postgres'
DB_PASSWORD = 'GradProjectPassword123!'