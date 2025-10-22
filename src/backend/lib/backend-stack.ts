import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Define the User Pool 
    const userPool = new cognito.UserPool(this, 'GradProjectUserPool', {
      userPoolName: 'autonomous-delivery-cart-users',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
        requireUppercase: true,
      },
      mfa: cognito.Mfa.OFF,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Define a "User Pool Client" 
    const userPoolClient = userPool.addClient('AppClient', {
      userPoolClientName: 'mobile-app-client',
      
      authFlows: {
        userSrp: true,
      },
    });

    // Output the key IDs for mobile app - this syntax remains the same
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'The ID of the Cognito User Pool',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'The ID of the User Pool Client for the mobile app',
    });
  }
}



