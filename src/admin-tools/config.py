# ==========================================
# AWS CONFIGURATION
# Copy these from your 'cdk deploy' outputs
# ==========================================


REGION = "eu-central-1"
USER_POOL_ID = "eu-central-1_7taSPuwuS"       # BackendStack.UserPoolId
CLIENT_ID = "1hfvun0t3n8r4tiuiun6pil4jh"    # BackendStack.UserPoolClientId
API_URL = "https://rw9lh7op1m.execute-api.eu-central-1.amazonaws.com/prod" # BackendStack.ApiGatewayUrl (No trailing slash)


# Admin credentials are usually picked up automatically from your local AWS CLI 
# (The same one you use for CDK).