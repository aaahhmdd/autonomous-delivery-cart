# ==========================================
# AWS CONFIGURATION
# Copy these from your 'cdk deploy' outputs
# ==========================================


REGION = "me-south-1"
USER_POOL_ID = "me-south-1_JWOdelqjQ"       # BackendStack.UserPoolId
CLIENT_ID = "ve8d0lmgfgdqshb4uphr5g8gj"    # BackendStack.UserPoolClientId
API_URL = "https://tvdboyoxti.execute-api.me-south-1.amazonaws.com/prod" # BackendStack.ApiGatewayUrl (No trailing slash)


# Admin credentials are usually picked up automatically from your local AWS CLI 
# (The same one you use for CDK).