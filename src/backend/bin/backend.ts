#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BackendStack } from '../lib/backend-stack';

const app = new cdk.App();

// This is where we create an instance of our stack.
new BackendStack(app, 'BackendStack', {
  // The 'env' property tells the CDK exactly where to deploy this stack.
  env: { 
    // Replace 'ACCOUNT_ID_FROM_AWS_CONSOLE' with your actual 12-digit AWS Account ID.
    account: '834508804120', 

    // This is the region you configured in your AWS CLI.
    region: 'eu-central-1' 
  },
});

    
