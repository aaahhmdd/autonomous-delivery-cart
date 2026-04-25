# AWS Configuration
# Replace these with your REAL outputs from 'cdk deploy'

API_BASE_URL = "https://rw9lh7op1m.execute-api.eu-central-1.amazonaws.com/prod" # No trailing slash
COGNITO_CLIENT_ID = "1hfvun0t3n8r4tiuiun6pil4jh"  # UserPoolClientId
COGNITO_REGION = "eu-central-1"

# Note: Streamlit doesn't need the User Pool ID for simple SRP auth if we use boto3, 
# but it's good to have if we expand.

