// sprint 2
/* import * as cdk from 'aws-cdk-lib';
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


*/

/*
// sprint 3

// sprint 3 (Path 2 – RDS Hack)

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as apigw2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as logs from 'aws-cdk-lib/aws-logs';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1️⃣ Cognito User Pool (no change)
    const userPool = new cognito.UserPool(this, 'GradProjectUserPool', {
      userPoolName: 'autonomous-delivery-cart-users',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
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

    const userPoolClient = userPool.addClient('AppClient', {
      userPoolClientName: 'mobile-app-client',
      authFlows: { userSrp: true },
    });

    // 2️⃣ VPC (no NAT Gateway → $0)
    const vpc = new ec2.Vpc(this, 'GradProjectVPC', {
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'public-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: 'isolated-subnet',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      natGateways: 0,
    });

    // 3️⃣ RDS (PostgreSQL Free Tier)
    const dbPassword = 'StrongPass123!'; // ⚠️ plaintext for demo only
    const dbInstance = new rds.DatabaseInstance(this, 'GradProjectDatabase', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      databaseName: 'gradproject',
      credentials: rds.Credentials.fromPassword(
        'admin',
        cdk.SecretValue.unsafePlainText(dbPassword)
      ),
      allocatedStorage: 20,
      multiAz: false,
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 4️⃣ HTTP API (free)
    const httpApi = new apigw2.HttpApi(this, 'GradProjectApi', {
      corsPreflight: {
        allowHeaders: ['Authorization', 'Content-Type', '*'],
        allowMethods: [
          apigw2.CorsHttpMethod.GET,
          apigw2.CorsHttpMethod.POST,
          apigw2.CorsHttpMethod.PUT,
          apigw2.CorsHttpMethod.DELETE,
        ],
        allowOrigins: ['*'],
      },
    });

    // 5️⃣ Cognito Authorizer
    const authorizer = new HttpUserPoolAuthorizer('CognitoAuthorizer', userPool, {
      userPoolClients: [userPoolClient],
    });

    // 6️⃣ Lambda environment (shared)
    const lambdaEnv = {
      DB_HOST: dbInstance.dbInstanceEndpointAddress,
      DB_USER: 'admin',
      DB_PASSWORD: dbPassword,
      DB_NAME: 'gradproject',
    };

    // 7️⃣ Profile Handler
    const profileHandler = new lambda.NodejsFunction(this, 'ProfileHandler', {
      runtime: Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/profileHandler.ts'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: lambdaEnv,
      bundling: {
        externalModules: ['pg'],
        forceDockerBundling: false,
      },
      logRetention: logs.RetentionDays.ONE_DAY,
    });
    dbInstance.connections.allowFrom(profileHandler, ec2.Port.tcp(5432));

    // 8️⃣ Product Handler
    const productHandler = new lambda.NodejsFunction(this, 'ProductHandler', {
      runtime: Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/productHandler.ts'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: lambdaEnv,
      bundling: {
        externalModules: ['pg'],
        forceDockerBundling: false,
      },
      logRetention: logs.RetentionDays.ONE_DAY,
    });
    dbInstance.connections.allowFrom(productHandler, ec2.Port.tcp(5432));

    // 9️⃣ Order Handler
    const orderHandler = new lambda.NodejsFunction(this, 'OrderHandler', {
      runtime: Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: path.join(__dirname, '../lambda/orderHandler.ts'),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: lambdaEnv,
      bundling: {
        externalModules: ['pg'],
        forceDockerBundling: false,
      },
      logRetention: logs.RetentionDays.ONE_DAY,
    });
    dbInstance.connections.allowFrom(orderHandler, ec2.Port.tcp(5432));

    // 🔟 API Routes
    httpApi.addRoutes({
      path: '/users/me',
      methods: [apigw2.HttpMethod.GET, apigw2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('ProfileIntegration', profileHandler),
      authorizer,
    });

    httpApi.addRoutes({
      path: '/vendors/{vendorId}/products',
      methods: [apigw2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('ProductIntegration', productHandler),
      authorizer,
    });

    httpApi.addRoutes({
      path: '/orders',
      methods: [apigw2.HttpMethod.POST, apigw2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('OrderIntegration', orderHandler),
      authorizer,
    });

    httpApi.addRoutes({
      path: '/orders/{orderId}',
      methods: [apigw2.HttpMethod.GET],
      integration: new HttpLambdaIntegration('OrderDetailsIntegration', orderHandler),
      authorizer,
    });

    // 🔹 Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'ApiEndpointUrl', { value: httpApi.url! });
    new cdk.CfnOutput(this, 'DatabaseEndpoint', { value: dbInstance.dbInstanceEndpointAddress });
  }
}



*/




















/*

// sprint 3

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
// **FIX 1**: Removed the dash from 'aws-api-gateway'
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { aws_iam as iam } from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

// --- !!! IMPORTANT !!! ---
// This is the name of your .pem key pair for EC2.
// You *must* create this in the AWS EC2 Console in your region (e.g., 'us-east-1')
// before you can deploy this stack.
// Example: 'my-project-key'
const EC2_KEY_PAIR_NAME = 'my-ec2-key-pair';
// --- !!! IMPORTANT !!! ---

// We will manually define the database password here to avoid using Secrets Manager
// and stay within the $0 free tier.
const DB_PASSWORD = 'GradProjectPassword123!';
const DB_NAME = 'deliverydb';
const DB_USER = 'postgres';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =================================================================
    // SPRINT 2: AUTHENTICATION
    // =================================================================

    // --- 1. Cognito User Pool ---
    const userPool = new cognito.UserPool(this, 'DeliveryUserPool', {
      userPoolName: 'delivery-user-pool',
      selfSignUpEnabled: true,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        phoneNumber: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
        requireUppercase: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- 2. Cognito User Pool Client ---
    const userPoolClient = new cognito.UserPoolClient(
      this,
      'DeliveryUserPoolClient',
      {
        userPool,
        authFlows: {
          userSrp: true,
        },
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.COGNITO,
        ],
      }
    );

    // =================================================================
    // SPRINT 3: DATABASE & API (OUR CURRENT SPRINT)
    // =================================================================

    // --- 3. Networking (VPC) ---
    // This creates a standard VPC with Public and Private subnets
    // Our Lambdas and Database will live in the Private subnet.
    const vpc = new ec2.Vpc(this, 'DeliveryVPC', {
      vpcName: 'delivery-vpc',
      maxAzs: 2, // Use 2 Availability Zones for high availability
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private-subnet',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED, // Use ISOLATED for $0 cost (no NAT)
        },
      ],
      natGateways: 0, // Explicitly set to 0 to avoid NAT Gateway costs
    });

    // --- 4. Database Security Group ---
    // This firewall only allows traffic from *within* the VPC on the PostgreSQL port
    const dbSecurityGroup = new ec2.SecurityGroup(
      this,
      'DbSecurityGroup',
      {
        vpc,
        description: 'Allow PostgreSQL inbound traffic from Lambda',
        allowAllOutbound: true,
      }
    );

    // --- 5. The RDS PostgreSQL Database ---
    const dbInstance = new rds.DatabaseInstance(this, 'DeliveryDatabase', {
      //
      // **FIX 1: Add VPC properties**
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      // **FIXED**: Changed 'securityGroup' to 'securityGroups' and made it an array
      securityGroups: [dbSecurityGroup],
      //
      engine: rds.DatabaseInstanceEngine.postgres({
        // **FIXED**: Changed to use the *major* version.
        // This lets AWS auto-select the latest supported *minor* version
        // (e.g., 15.5, 15.4) available in your region.
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      //
      // **FIX 2: Remove duplicate 'databaseName'**
      databaseName: DB_NAME,
      //
      credentials: rds.Credentials.fromPassword(
        DB_USER,
        cdk.SecretValue.unsafePlainText(DB_PASSWORD) // Use unsafePlainText for $0 cost
      ),
      //
      // **FIX 3 & 4: Remove duplicate 'allocatedStorage' and 'maxAllocatedStorage'**
      allocatedStorage: 20, // 20 GB is in the free tier
      maxAllocatedStorage: 50, // Allow autoscaling up to 50 GB
      //
      // Free Tier configuration
      multiAz: false, // Free tier is Single-AZ
      publiclyAccessible: false, // NOT accessible from the internet
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Automatically delete on 'cdk destroy'
    });

    // --- 6. Bastion Host (for us to connect to the DB) ---
    // We create a "jump box" in the public subnet to connect to our private DB
    // We will use SSM Session Manager (NOT SSH) to connect, so it's more secure
    // and doesn't require us to open port 22.
    const bastion = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc,
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
      instanceName: 'delivery-bastion',
      instanceType: ec2.InstanceType.of(
        // **FIXED**: Changed from T2 (Intel) to T4G (Graviton)
        // This matches our database instance family, is also Free Tier,
        // and resolves the "configuration not supported" error.
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      // This is the *only* thing we need to allow.
      // The Bastion needs to talk to the DB on port 5432
      securityGroup: new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
        vpc,
        description: 'Allow SSH/SSM access to Bastion',
        allowAllOutbound: true,
      }),
    });

    // **FIXED**: Use this method to open the port
    // This tells the Database's firewall to allow connections *from* the
    // Bastion's firewall on port 5432.
    dbInstance.connections.allowFrom(
      // **FIXED**: The bastion host construct itself is 'IConnectable'
      bastion,
      ec2.Port.tcp(5432),
      'Allow connection from Bastion host'
    );

    // The Bastion also needs an IAM role to allow SSM connections
    bastion.instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'AmazonSSMManagedInstanceCore'
      )
    );

    // --- 7. Lambda Function Environment ---
    // These are the common settings for all our functions
    const lambdaEnvironment = {
      DB_HOST: dbInstance.dbInstanceEndpointAddress,
      DB_PORT: dbInstance.dbInstanceEndpointPort,
      DB_NAME: DB_NAME,
      DB_USER: DB_USER,
      DB_PASSWORD: DB_PASSWORD,
    };

    const lambdaCommonProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        externalModules: ['aws-sdk', 'pg-native'],
      },
      logRetention: RetentionDays.ONE_WEEK,
    };

    // --- 8. Define ALL Lambda Functions ---

    // The Order Handler (POST /orders, GET /orders, GET /vendors/{id}/orders)
    const orderLambda = new lambdaNodejs.NodejsFunction(
      this,
      'OrderHandler',
      {
        ...lambdaCommonProps,
        functionName: 'order-handler',
        // **FIXED**: Case sensitivity
        entry: 'lambda/orderHandler.ts',
      }
    );

    // The Profile Handler (GET /users/me, POST /users/me)
    const profileLambda = new lambdaNodejs.NodejsFunction(
      this,
      'ProfileHandler',
      {
        ...lambdaCommonProps,
        functionName: 'profile-handler',
        // **FIXED**: Case sensitivity
        entry: 'lambda/profileHandler.ts',
      }
    );

    // The Product Handler (GET /vendors/{id}/products)
    const productLambda = new lambdaNodejs.NodejsFunction(
      this,
      'ProductHandler',
      {
        ...lambdaCommonProps,
        functionName: 'product-handler',
        // **FIXED**: Case sensitivity
        entry: 'lambda/productHandler.ts',
      }
    );

    // --- 9. Grant DB Access to Lambdas ---
    // **FIXED**: This is the correct way to grant network access without IAM errors
    orderLambda.connections.allowTo(
      dbInstance,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to DB'
    );
    profileLambda.connections.allowTo(
      dbInstance,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to DB'
    );
    productLambda.connections.allowTo(
      dbInstance,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to DB'
    );

    // --- 10. API Gateway (REST API) ---
    const api = new apigateway.RestApi(this, 'DeliveryApi', {
      restApiName: 'Delivery Service API',
      description: 'API for the autonomous delivery cart system.',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
      },
    });

    // --- 11. Cognito Authorizer for the API ---
    // This tells API Gateway how to validate the JWT token from Cognito
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      'CognitoAuthorizer',
      {
        cognitoUserPools: [userPool],
      }
    );

    // This is the configuration for a *secured* endpoint
    const authMethodOptions = {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // --- 12. Define API Endpoints ---

    // Integrate Lambdas with API Gateway
    const orderIntegration = new apigateway.LambdaIntegration(orderLambda);
    const profileIntegration = new apigateway.LambdaIntegration(profileLambda);
    const productIntegration = new apigateway.LambdaIntegration(productLambda);

    // --- /orders ---
    const ordersResource = api.root.addResource('orders');
    ordersResource.addMethod('POST', orderIntegration, authMethodOptions); // POST /orders (Secured)
    ordersResource.addMethod('GET', orderIntegration, authMethodOptions); // GET /orders (Secured)

    // --- /orders/{orderId} ---
    const orderIdResource = ordersResource.addResource('{orderId}');
    orderIdResource.addMethod('GET', orderIntegration, authMethodOptions); // GET /orders/{orderId} (Secured)

    // --- /vendors/{id}/orders ---
    const vendorsResource = api.root.addResource('vendors');
    const vendorIdResource = vendorsResource.addResource('{id}');
    const vendorOrdersResource = vendorIdResource.addResource('orders');
    vendorOrdersResource.addMethod('GET', orderIntegration, authMethodOptions); // GET /vendors/{id}/orders (Secured)

    // --- /vendors/{id}/products ---
    const vendorProductsResource = vendorIdResource.addResource('products');
    vendorProductsResource.addMethod('GET', productIntegration); // GET /vendors/{id}/products (Public)

    // --- /users/me ---
    const usersResource = api.root.addResource('users');
    const userMeResource = usersResource.addResource('me');
    userMeResource.addMethod('GET', profileIntegration, authMethodOptions); // GET /users/me (Secured)
    userMeResource.addMethod('POST', profileIntegration, authMethodOptions); // POST /users/me (Secured)

    // =================================================================
    // OUTPUTS
    // =================================================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.url,
    });
    // **FIX 3**: Corrected typo 'cnd' to 'cdk'
    new cdk.CfnOutput(this, 'BastionHostId', {
      value: bastion.instanceId,
    });
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress,
    });
  }
}

*/


// sprint 4 - v1 

/*


import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { aws_iam as iam } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

// --- Constants ---
const DB_PASSWORD = 'GradProjectPassword123!';
const DB_NAME = 'deliverydb';
const DB_USER = 'postgres';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =================================================================
    // SPRINT 2: AUTHENTICATION (UNCHANGED)
    // =================================================================

    const userPool = new cognito.UserPool(this, 'DeliveryUserPool', {
      userPoolName: 'delivery-user-pool',
      selfSignUpEnabled: true,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        phoneNumber: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
        requireUppercase: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(
      this,
      'DeliveryUserPoolClient',
      {
        userPool,
        authFlows: {
          userSrp: true,
        },
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.COGNITO,
        ],
      }
    );

    // =================================================================
    // SPRINT 3: DATABASE & API (PRESERVED)
    // =================================================================

    // --- 3. Networking (VPC) ---
    const vpc = new ec2.Vpc(this, 'DeliveryVPC', {
      vpcName: 'delivery-vpc',
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private-subnet',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      natGateways: 0,
    });

    // --- 4. Database Security Group ---
    const dbSecurityGroup = new ec2.SecurityGroup(
      this,
      'DbSecurityGroup',
      {
        vpc,
        description: 'Allow PostgreSQL inbound traffic from Lambda',
        allowAllOutbound: true,
      }
    );

    // --- 5. The RDS PostgreSQL Database ---
    const dbInstance = new rds.DatabaseInstance(this, 'DeliveryDatabase', {
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      databaseName: DB_NAME,
      credentials: rds.Credentials.fromPassword(
        DB_USER,
        cdk.SecretValue.unsafePlainText(DB_PASSWORD)
      ),
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      multiAz: false,
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // --- 6. Bastion Host ---
    const bastion = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc,
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
      instanceName: 'delivery-bastion',
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      securityGroup: new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
        vpc,
        description: 'Allow SSH/SSM access to Bastion',
        allowAllOutbound: true,
      }),
    });

    // Correct: Allow DB to receive traffic FROM Bastion
    dbInstance.connections.allowFrom(
      bastion,
      ec2.Port.tcp(5432),
      'Allow connection from Bastion host'
    );

    bastion.instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'AmazonSSMManagedInstanceCore'
      )
    );

    // --- 7. Lambda Function Environment ---
    const lambdaEnvironment = {
      DB_HOST: dbInstance.dbInstanceEndpointAddress,
      DB_PORT: dbInstance.dbInstanceEndpointPort,
      DB_NAME: DB_NAME,
      DB_USER: DB_USER,
      DB_PASSWORD: DB_PASSWORD,
    };

    const lambdaCommonProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        externalModules: ['aws-sdk', 'pg-native'],
      },
      logRetention: RetentionDays.ONE_WEEK,
    };

    // --- 8. Define ALL Lambda Functions ---
    
    // Existing Sprint 3 Lambdas
    const orderLambda = new lambdaNodejs.NodejsFunction(
      this,
      'OrderHandler',
      {
        ...lambdaCommonProps,
        functionName: 'order-handler',
        entry: 'lambda/orderHandler.ts',
      }
    );

    const profileLambda = new lambdaNodejs.NodejsFunction(
      this,
      'ProfileHandler',
      {
        ...lambdaCommonProps,
        functionName: 'profile-handler',
        entry: 'lambda/profileHandler.ts',
      }
    );

    const productLambda = new lambdaNodejs.NodejsFunction(
      this,
      'ProductHandler',
      {
        ...lambdaCommonProps,
        functionName: 'product-handler',
        entry: 'lambda/productHandler.ts',
      }
    );

    // *** SPRINT 4 ADDITION: New Inventory Handler ***
    const inventoryLambda = new lambdaNodejs.NodejsFunction(
      this,
      'InventoryHandler',
      {
        ...lambdaCommonProps,
        functionName: 'inventory-handler',
        entry: 'lambda/inventoryHandler.ts',
      }
    );

    // --- 9. Grant DB Access to Lambdas (CORRECTED DIRECTION) ---
    // The Lambda initiates connection TO the DB.
    
    orderLambda.connections.allowTo(
      dbInstance,
      ec2.Port.tcp(5432),
      'Allow Order Lambda to connect to DB'
    );
    
    profileLambda.connections.allowTo(
      dbInstance,
      ec2.Port.tcp(5432),
      'Allow Profile Lambda to connect to DB'
    );
    
    productLambda.connections.allowTo(
      dbInstance,
      ec2.Port.tcp(5432),
      'Allow Product Lambda to connect to DB'
    );

    // *** SPRINT 4 ADDITION: Grant access to new Lambda ***
    inventoryLambda.connections.allowTo(
      dbInstance,
      ec2.Port.tcp(5432),
      'Allow Inventory Lambda to connect to DB'
    );

    // --- 10. API Gateway (REST API) ---
    const api = new apigateway.RestApi(this, 'DeliveryApi', {
      restApiName: 'Delivery Service API',
      description: 'API for the autonomous delivery cart system.',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'Idempotency-Key', 
        ],
      },
    });

    // --- 11. Cognito Authorizer for the API ---
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      'CognitoAuthorizer',
      {
        cognitoUserPools: [userPool],
      }
    );

    const authMethodOptions = {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // --- 12. Define API Endpoints ---
    
    // Integrations
    const orderIntegration = new apigateway.LambdaIntegration(orderLambda);
    const profileIntegration = new apigateway.LambdaIntegration(profileLambda);
    const productIntegration = new apigateway.LambdaIntegration(productLambda);
    // *** SPRINT 4 ADDITION: Inventory Integration ***
    const inventoryIntegration = new apigateway.LambdaIntegration(inventoryLambda);

    // --- /orders ---
    const ordersResource = api.root.addResource('orders');
    ordersResource.addMethod('POST', orderIntegration, authMethodOptions); // POST /orders
    ordersResource.addMethod('GET', orderIntegration, authMethodOptions); // GET /orders

    // --- /orders/{orderId} ---
    const orderIdResource = ordersResource.addResource('{orderId}');
    orderIdResource.addMethod('GET', orderIntegration, authMethodOptions); // GET /orders/{orderId}

    // *** SPRINT 4 ADDITION: PUT /orders/{orderId}/status ***
    // Allows vendors to update order status
    const orderStatusResource = orderIdResource.addResource('status');
    orderStatusResource.addMethod('PUT', orderIntegration, authMethodOptions);

    // --- /vendors/{id}/orders ---
    const vendorsResource = api.root.addResource('vendors');
    const vendorIdResource = vendorsResource.addResource('{id}');
    const vendorOrdersResource = vendorIdResource.addResource('orders');
    vendorOrdersResource.addMethod('GET', orderIntegration, authMethodOptions); // GET /vendors/{id}/orders

    // --- /vendors/{id}/products ---
    const vendorProductsResource = vendorIdResource.addResource('products');
    vendorProductsResource.addMethod('GET', productIntegration); // GET /vendors/{id}/products (Public)

    // --- /users/me ---
    const usersResource = api.root.addResource('users');
    const userMeResource = usersResource.addResource('me');
    userMeResource.addMethod('GET', profileIntegration, authMethodOptions); // GET /users/me
    userMeResource.addMethod('POST', profileIntegration, authMethodOptions); // POST /users/me

    // *** SPRINT 4 ADDITION: /users/me/products (Vendor Inventory Mgmt) ***
    const userMeProductsResource = userMeResource.addResource('products');
    // GET: View own inventory
    userMeProductsResource.addMethod('GET', inventoryIntegration, authMethodOptions);
    // POST: Add new product
    userMeProductsResource.addMethod('POST', inventoryIntegration, authMethodOptions);
    
    // PUT: Update product
    const userMeProductIdResource = userMeProductsResource.addResource('{productId}');
    userMeProductIdResource.addMethod('PUT', inventoryIntegration, authMethodOptions);

    // =================================================================
    // OUTPUTS (UNCHANGED)
    // =================================================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.url,
    });
    new cdk.CfnOutput(this, 'BastionHostId', {
      value: bastion.instanceId,
    });
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress,
    });
  }
}

*/



/*

// sprint 4 - v2 


import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { aws_iam as iam } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

// --- Constants ---
const DB_PASSWORD = 'GradProjectPassword123!';
const DB_NAME = 'deliverydb';
const DB_USER = 'postgres';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =================================================================
    // AUTHENTICATION (Unchanged)
    // =================================================================
    const userPool = new cognito.UserPool(this, 'DeliveryUserPool', {
      userPoolName: 'delivery-user-pool',
      selfSignUpEnabled: true,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userVerification: { emailStyle: cognito.VerificationEmailStyle.CODE },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        phoneNumber: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8, requireLowercase: true, requireDigits: true, requireSymbols: false, requireUppercase: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'DeliveryUserPoolClient', {
      userPool,
      authFlows: { userSrp: true,
        userPassword: true,
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    // =================================================================
    // INFRASTRUCTURE (VPC & RDS) (Unchanged)
    // =================================================================
    const vpc = new ec2.Vpc(this, 'DeliveryVPC', {
      vpcName: 'delivery-vpc',
      maxAzs: 2,
      subnetConfiguration: [
        { cidrMask: 24, name: 'public-subnet', subnetType: ec2.SubnetType.PUBLIC },
        { cidrMask: 24, name: 'private-subnet', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
      natGateways: 0,
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Allow PostgreSQL inbound traffic from Lambda',
      allowAllOutbound: true,
    });

    const dbInstance = new rds.DatabaseInstance(this, 'DeliveryDatabase', {
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_15 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      databaseName: DB_NAME,
      credentials: rds.Credentials.fromPassword(DB_USER, cdk.SecretValue.unsafePlainText(DB_PASSWORD)),
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      multiAz: false,
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const bastion = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc,
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
      instanceName: 'delivery-bastion',
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      securityGroup: new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
        vpc, description: 'Allow SSH/SSM access to Bastion', allowAllOutbound: true,
      }),
    });

    dbInstance.connections.allowFrom(bastion, ec2.Port.tcp(5432), 'Allow connection from Bastion host');
    bastion.instance.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    // =================================================================
    // LAMBDA FUNCTIONS
    // =================================================================
    const lambdaEnvironment = {
      DB_HOST: dbInstance.dbInstanceEndpointAddress,
      DB_PORT: dbInstance.dbInstanceEndpointPort,
      DB_NAME: DB_NAME,
      DB_USER: DB_USER,
      DB_PASSWORD: DB_PASSWORD,
    };

    const lambdaCommonProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(10),
      bundling: { externalModules: ['aws-sdk', 'pg-native'] },
      logRetention: RetentionDays.ONE_WEEK,
    };

    const orderLambda = new lambdaNodejs.NodejsFunction(this, 'OrderHandler', {
      ...lambdaCommonProps,
      functionName: 'order-handler',
      entry: 'lambda/orderHandler.ts',
    });

    const profileLambda = new lambdaNodejs.NodejsFunction(this, 'ProfileHandler', {
      ...lambdaCommonProps,
      functionName: 'profile-handler',
      entry: 'lambda/profileHandler.ts',
    });

    const productLambda = new lambdaNodejs.NodejsFunction(this, 'ProductHandler', {
      ...lambdaCommonProps,
      functionName: 'product-handler',
      entry: 'lambda/productHandler.ts',
    });

    const inventoryLambda = new lambdaNodejs.NodejsFunction(this, 'InventoryHandler', {
      ...lambdaCommonProps,
      functionName: 'inventory-handler',
      entry: 'lambda/inventoryHandler.ts',
    });

    // *** NEW: Analytics Handler ***
    const analyticsLambda = new lambdaNodejs.NodejsFunction(this, 'AnalyticsHandler', {
      ...lambdaCommonProps,
      functionName: 'analytics-handler',
      entry: 'lambda/analyticsHandler.ts',
    });

    // --- Grant Access ---
    orderLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Order Lambda to DB');
    profileLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Profile Lambda to DB');
    productLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Product Lambda to DB');
    inventoryLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Inventory Lambda to DB');
    analyticsLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Analytics Lambda to DB');

    // =================================================================
    // API GATEWAY
    // =================================================================
    const api = new apigateway.RestApi(this, 'DeliveryApi', {
      restApiName: 'Delivery Service API',
      description: 'API for the autonomous delivery cart system.',
      deployOptions: { stageName: 'prod' },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'Idempotency-Key'],
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });
    const authMethodOptions = {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // Integrations
    const orderIntegration = new apigateway.LambdaIntegration(orderLambda);
    const profileIntegration = new apigateway.LambdaIntegration(profileLambda);
    const productIntegration = new apigateway.LambdaIntegration(productLambda);
    const inventoryIntegration = new apigateway.LambdaIntegration(inventoryLambda);
    const analyticsIntegration = new apigateway.LambdaIntegration(analyticsLambda);

    // --- Routes ---

    // /orders
    const ordersResource = api.root.addResource('orders');
    ordersResource.addMethod('POST', orderIntegration, authMethodOptions);
    ordersResource.addMethod('GET', orderIntegration, authMethodOptions);

    // /orders/{orderId}
    const orderIdResource = ordersResource.addResource('{orderId}');
    orderIdResource.addMethod('GET', orderIntegration, authMethodOptions);
    orderIdResource.addResource('status').addMethod('PUT', orderIntegration, authMethodOptions);

    // /vendors
    const vendorsResource = api.root.addResource('vendors');
    // NEW: GET /vendors (List vendors by compound) - Public
    vendorsResource.addMethod('GET', productIntegration);

    // /vendors/{id}/orders
    const vendorIdResource = vendorsResource.addResource('{id}');
    vendorIdResource.addResource('orders').addMethod('GET', orderIntegration, authMethodOptions);
    // /vendors/{id}/products
    vendorIdResource.addResource('products').addMethod('GET', productIntegration);

    // /users/me
    const usersResource = api.root.addResource('users');
    const userMeResource = usersResource.addResource('me');
    userMeResource.addMethod('GET', profileIntegration, authMethodOptions);
    userMeResource.addMethod('POST', profileIntegration, authMethodOptions);
    
    // /users/me/products
    const userMeProductsResource = userMeResource.addResource('products');
    userMeProductsResource.addMethod('GET', inventoryIntegration, authMethodOptions);
    userMeProductsResource.addMethod('POST', inventoryIntegration, authMethodOptions);
    userMeProductsResource.addResource('{productId}').addMethod('PUT', inventoryIntegration, authMethodOptions);

    // NEW: /users/me/analytics
    userMeResource.addResource('analytics').addMethod('GET', analyticsIntegration, authMethodOptions);

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'ApiGatewayUrl', { value: api.url });
    new cdk.CfnOutput(this, 'BastionHostId', { value: bastion.instanceId });
    new cdk.CfnOutput(this, 'DatabaseEndpoint', { value: dbInstance.dbInstanceEndpointAddress });
  }
}

*/

/*

// Sprint - 5 - v1



import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'; // NEW: For IoT Data
import * as iot from 'aws-cdk-lib/aws-iot';           // NEW: For IoT Rules
import { aws_iam as iam } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

// --- Constants ---
const DB_PASSWORD = 'GradProjectPassword123!';
const DB_NAME = 'deliverydb';
const DB_USER = 'postgres';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =================================================================
    // SPRINT 2: AUTHENTICATION (UNCHANGED)
    // =================================================================
    const userPool = new cognito.UserPool(this, 'DeliveryUserPool', {
      userPoolName: 'delivery-user-pool',
      selfSignUpEnabled: true,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userVerification: { emailStyle: cognito.VerificationEmailStyle.CODE },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        phoneNumber: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8, requireLowercase: true, requireDigits: true, requireSymbols: false, requireUppercase: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'DeliveryUserPoolClient', {
      userPool,
      authFlows: { userSrp: true, userPassword: true },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    // =================================================================
    // SPRINT 3: DATABASE & API (PRESERVED)
    // =================================================================
    const vpc = new ec2.Vpc(this, 'DeliveryVPC', {
      vpcName: 'delivery-vpc',
      maxAzs: 2,
      subnetConfiguration: [
        { cidrMask: 24, name: 'public-subnet', subnetType: ec2.SubnetType.PUBLIC },
        { cidrMask: 24, name: 'private-subnet', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      ],
      natGateways: 0,
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc,
      description: 'Allow PostgreSQL inbound traffic from Lambda',
      allowAllOutbound: true,
    });

    const dbInstance = new rds.DatabaseInstance(this, 'DeliveryDatabase', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_15 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      databaseName: DB_NAME,
      credentials: rds.Credentials.fromPassword(DB_USER, cdk.SecretValue.unsafePlainText(DB_PASSWORD)),
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      multiAz: false,
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const bastion = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc,
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
      instanceName: 'delivery-bastion',
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      securityGroup: new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
        vpc, description: 'Allow SSH/SSM access to Bastion', allowAllOutbound: true,
      }),
    });

    dbInstance.connections.allowFrom(bastion, ec2.Port.tcp(5432), 'Allow connection from Bastion host');
    bastion.instance.role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'));

    // --- 7. Lambda Function Environment ---
    const lambdaEnvironment = {
      DB_HOST: dbInstance.dbInstanceEndpointAddress,
      DB_PORT: dbInstance.dbInstanceEndpointPort,
      DB_NAME: DB_NAME,
      DB_USER: DB_USER,
      DB_PASSWORD: DB_PASSWORD,
    };

    const lambdaCommonProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(10),
      bundling: { externalModules: ['aws-sdk', 'pg-native'] },
      logRetention: RetentionDays.ONE_WEEK,
    };

    // --- 8. Define ALL Lambda Functions ---
    const orderLambda = new lambdaNodejs.NodejsFunction(this, 'OrderHandler', {
      ...lambdaCommonProps,
      functionName: 'order-handler',
      entry: 'lambda/orderHandler.ts',
    });

    const profileLambda = new lambdaNodejs.NodejsFunction(this, 'ProfileHandler', {
      ...lambdaCommonProps,
      functionName: 'profile-handler',
      entry: 'lambda/profileHandler.ts',
    });

    const productLambda = new lambdaNodejs.NodejsFunction(this, 'ProductHandler', {
      ...lambdaCommonProps,
      functionName: 'product-handler',
      entry: 'lambda/productHandler.ts',
    });

    const inventoryLambda = new lambdaNodejs.NodejsFunction(this, 'InventoryHandler', {
      ...lambdaCommonProps,
      functionName: 'inventory-handler',
      entry: 'lambda/inventoryHandler.ts',
    });

    const analyticsLambda = new lambdaNodejs.NodejsFunction(this, 'AnalyticsHandler', {
      ...lambdaCommonProps,
      functionName: 'analytics-handler',
      entry: 'lambda/analyticsHandler.ts',
    });

    // --- 9. Grant DB Access (CORRECTED DIRECTION: Lambda -> DB) ---
    orderLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Order Lambda to DB');
    profileLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Profile Lambda to DB');
    productLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Product Lambda to DB');
    inventoryLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Inventory Lambda to DB');
    analyticsLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Analytics Lambda to DB');

    // --- 10. API Gateway ---
    const api = new apigateway.RestApi(this, 'DeliveryApi', {
      restApiName: 'Delivery Service API',
      description: 'API for the autonomous delivery cart system.',
      deployOptions: { stageName: 'prod' },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key', 'Idempotency-Key'],
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });
    const authMethodOptions = {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // Integrations
    const orderIntegration = new apigateway.LambdaIntegration(orderLambda);
    const profileIntegration = new apigateway.LambdaIntegration(profileLambda);
    const productIntegration = new apigateway.LambdaIntegration(productLambda);
    const inventoryIntegration = new apigateway.LambdaIntegration(inventoryLambda);
    const analyticsIntegration = new apigateway.LambdaIntegration(analyticsLambda);

    // --- Routes ---

    // /orders
    const ordersResource = api.root.addResource('orders');
    ordersResource.addMethod('POST', orderIntegration, authMethodOptions);
    ordersResource.addMethod('GET', orderIntegration, authMethodOptions);

    // /orders/{orderId}
    const orderIdResource = ordersResource.addResource('{orderId}');
    orderIdResource.addMethod('GET', orderIntegration, authMethodOptions);
    orderIdResource.addResource('status').addMethod('PUT', orderIntegration, authMethodOptions);

    // /vendors
    const vendorsResource = api.root.addResource('vendors');
    // NEW: GET /vendors?compound=X (List vendors in a compound) - Public
    vendorsResource.addMethod('GET', productIntegration);

    // /vendors/{id}
    const vendorIdResource = vendorsResource.addResource('{id}');
    vendorIdResource.addResource('orders').addMethod('GET', orderIntegration, authMethodOptions);
    vendorIdResource.addResource('products').addMethod('GET', productIntegration);

    // /users/me
    const usersResource = api.root.addResource('users');
    const userMeResource = usersResource.addResource('me');
    userMeResource.addMethod('GET', profileIntegration, authMethodOptions);
    userMeResource.addMethod('POST', profileIntegration, authMethodOptions);
    
    // /users/me/products
    const userMeProductsResource = userMeResource.addResource('products');
    userMeProductsResource.addMethod('GET', inventoryIntegration, authMethodOptions);
    userMeProductsResource.addMethod('POST', inventoryIntegration, authMethodOptions);
    userMeProductsResource.addResource('{productId}').addMethod('PUT', inventoryIntegration, authMethodOptions);

    // NEW: /users/me/analytics
    userMeResource.addResource('analytics').addMethod('GET', analyticsIntegration, authMethodOptions);

    // =================================================================
    // SPRINT 5: IOT & TELEMETRY (NEW ADDITION)
    // =================================================================

    // 1. DynamoDB Table for Real-Time Cart Telemetry
    // PK: cart_id (String), SK: timestamp (Number)
    const telemetryTable = new dynamodb.Table(this, 'CartTelemetryTable', {
      tableName: 'CartTelemetry',
      partitionKey: { name: 'cart_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // Free tier friendly
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 2. Ingestion Lambda
    // Receives MQTT message -> Writes to DynamoDB
    const telemetryLambda = new lambdaNodejs.NodejsFunction(this, 'TelemetryHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      entry: 'lambda/telemetryHandler.ts',
      environment: {
        TELEMETRY_TABLE_NAME: telemetryTable.tableName,
      },
      // Note: This Lambda does NOT need VPC access for basic DynamoDB writing. 
      // Keeping it outside VPC avoids cold starts for high-frequency IoT data.
    });

    // Grant Lambda permission to write to DynamoDB
    telemetryTable.grantWriteData(telemetryLambda);

    // 3. IoT Topic Rule
    // Listens to "carts/+/telemetry" (+ is a wildcard for any cart ID)
    // Forwards data to the Lambda
    const telemetryRule = new iot.CfnTopicRule(this, 'TelemetryRule', {
      ruleName: 'CartTelemetryIngestion',
      topicRulePayload: {
        sql: "SELECT * FROM 'carts/+/telemetry'",
        actions: [
          {
            lambda: {
              functionArn: telemetryLambda.functionArn,
            },
          },
        ],
        ruleDisabled: false,
      },
    });

    // Allow IoT Core to invoke the Lambda
    telemetryLambda.addPermission('IoTPermission', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      sourceArn: telemetryRule.attrArn,
    });

    // =================================================================
    // OUTPUTS
    // =================================================================
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'ApiGatewayUrl', { value: api.url });
    new cdk.CfnOutput(this, 'BastionHostId', { value: bastion.instanceId });
    new cdk.CfnOutput(this, 'DatabaseEndpoint', { value: dbInstance.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, 'TelemetryTableName', { value: telemetryTable.tableName });
  }
}

*/



// Sprint 5 - v2



import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'; // NEW: For IoT Data
import * as iot from 'aws-cdk-lib/aws-iot';           // NEW: For IoT Rules
import { aws_iam as iam } from 'aws-cdk-lib';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';

// --- Constants ---
const DB_PASSWORD = 'GradProjectPassword123!';
const DB_NAME = 'deliverydb';
const DB_USER = 'postgres';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // =================================================================
    // SPRINT 2: AUTHENTICATION (UNCHANGED)
    // =================================================================
    const userPool = new cognito.UserPool(this, 'DeliveryUserPool', {
      userPoolName: 'delivery-user-pool',
      selfSignUpEnabled: true,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        phoneNumber: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
        requireUppercase: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(
      this,
      'DeliveryUserPoolClient',
      {
        userPool,
        authFlows: {
          userSrp: true,
          userPassword: true, // Required for your Python Admin Tool
        },
        supportedIdentityProviders: [
          cognito.UserPoolClientIdentityProvider.COGNITO,
        ],
      }
    );

    // =================================================================
    // SPRINT 3: INFRASTRUCTURE (VPC & RDS) (UNCHANGED)
    // =================================================================
    const vpc = new ec2.Vpc(this, 'DeliveryVPC', {
      vpcName: 'delivery-vpc',
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'public-subnet',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'private-subnet',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
      natGateways: 0,
    });

    const dbSecurityGroup = new ec2.SecurityGroup(
      this,
      'DbSecurityGroup',
      {
        vpc,
        description: 'Allow PostgreSQL inbound traffic from Lambda',
        allowAllOutbound: true,
      }
    );

    const dbInstance = new rds.DatabaseInstance(this, 'DeliveryDatabase', {
      vpc: vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      securityGroups: [dbSecurityGroup],
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      databaseName: DB_NAME,
      credentials: rds.Credentials.fromPassword(
        DB_USER,
        cdk.SecretValue.unsafePlainText(DB_PASSWORD)
      ),
      allocatedStorage: 20,
      maxAllocatedStorage: 50,
      multiAz: false,
      publiclyAccessible: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const bastion = new ec2.BastionHostLinux(this, 'BastionHost', {
      vpc,
      subnetSelection: { subnetType: ec2.SubnetType.PUBLIC },
      instanceName: 'delivery-bastion',
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      securityGroup: new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
        vpc,
        description: 'Allow SSH/SSM access to Bastion',
        allowAllOutbound: true,
      }),
    });

    dbInstance.connections.allowFrom(
      bastion,
      ec2.Port.tcp(5432),
      'Allow connection from Bastion host'
    );

    bastion.instance.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'AmazonSSMManagedInstanceCore'
      )
    );

    // --- 7. Lambda Function Environment ---
    const lambdaEnvironment = {
      DB_HOST: dbInstance.dbInstanceEndpointAddress,
      DB_PORT: dbInstance.dbInstanceEndpointPort,
      DB_NAME: DB_NAME,
      DB_USER: DB_USER,
      DB_PASSWORD: DB_PASSWORD,
    };

    const lambdaCommonProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      vpc: vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      environment: lambdaEnvironment,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        externalModules: ['aws-sdk', 'pg-native'],
      },
      logRetention: RetentionDays.ONE_WEEK,
    };

    // --- 8. Define ALL Lambda Functions (Sprint 3 & 4) ---
    
    const orderLambda = new lambdaNodejs.NodejsFunction(
      this,
      'OrderHandler',
      {
        ...lambdaCommonProps,
        functionName: 'order-handler',
        entry: 'lambda/orderHandler.ts',
      }
    );

    const profileLambda = new lambdaNodejs.NodejsFunction(
      this,
      'ProfileHandler',
      {
        ...lambdaCommonProps,
        functionName: 'profile-handler',
        entry: 'lambda/profileHandler.ts',
      }
    );

    const productLambda = new lambdaNodejs.NodejsFunction(
      this,
      'ProductHandler',
      {
        ...lambdaCommonProps,
        functionName: 'product-handler',
        entry: 'lambda/productHandler.ts',
      }
    );

    const inventoryLambda = new lambdaNodejs.NodejsFunction(
      this,
      'InventoryHandler',
      {
        ...lambdaCommonProps,
        functionName: 'inventory-handler',
        entry: 'lambda/inventoryHandler.ts',
      }
    );

    const analyticsLambda = new lambdaNodejs.NodejsFunction(
      this,
      'AnalyticsHandler',
      {
        ...lambdaCommonProps,
        functionName: 'analytics-handler',
        entry: 'lambda/analyticsHandler.ts',
      }
    );

    // --- 9. Grant DB Access ---
    orderLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Order Lambda to DB');
    profileLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Profile Lambda to DB');
    productLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Product Lambda to DB');
    inventoryLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Inventory Lambda to DB');
    analyticsLambda.connections.allowTo(dbInstance, ec2.Port.tcp(5432), 'Analytics Lambda to DB');

    // =================================================================
    // API GATEWAY (Unchanged)
    // =================================================================
    const api = new apigateway.RestApi(this, 'DeliveryApi', {
      restApiName: 'Delivery Service API',
      description: 'API for the autonomous delivery cart system.',
      deployOptions: { stageName: 'prod' },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'Idempotency-Key', 
        ],
      },
    });

    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      'CognitoAuthorizer',
      {
        cognitoUserPools: [userPool],
      }
    );

    const authMethodOptions = {
      authorizer: authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // Integrations
    const orderIntegration = new apigateway.LambdaIntegration(orderLambda);
    const profileIntegration = new apigateway.LambdaIntegration(profileLambda);
    const productIntegration = new apigateway.LambdaIntegration(productLambda);
    const inventoryIntegration = new apigateway.LambdaIntegration(inventoryLambda);
    const analyticsIntegration = new apigateway.LambdaIntegration(analyticsLambda);

    // --- Routes (Sprint 3 & 4) ---

    // /orders
    const ordersResource = api.root.addResource('orders');
    ordersResource.addMethod('POST', orderIntegration, authMethodOptions);
    ordersResource.addMethod('GET', orderIntegration, authMethodOptions);

    // /orders/{orderId}
    const orderIdResource = ordersResource.addResource('{orderId}');
    orderIdResource.addMethod('GET', orderIntegration, authMethodOptions);
    orderIdResource.addResource('status').addMethod('PUT', orderIntegration, authMethodOptions);

    // /vendors
    const vendorsResource = api.root.addResource('vendors');
    vendorsResource.addMethod('GET', productIntegration); // GET /vendors (Public)

    // /vendors/{id}/...
    const vendorIdResource = vendorsResource.addResource('{id}');
    vendorIdResource.addResource('orders').addMethod('GET', orderIntegration, authMethodOptions);
    vendorIdResource.addResource('products').addMethod('GET', productIntegration);

    // /users/me
    const usersResource = api.root.addResource('users');
    const userMeResource = usersResource.addResource('me');
    userMeResource.addMethod('GET', profileIntegration, authMethodOptions);
    userMeResource.addMethod('POST', profileIntegration, authMethodOptions);
    
    // /users/me/products
    const userMeProductsResource = userMeResource.addResource('products');
    userMeProductsResource.addMethod('GET', inventoryIntegration, authMethodOptions);
    userMeProductsResource.addMethod('POST', inventoryIntegration, authMethodOptions);
    userMeProductsResource.addResource('{productId}').addMethod('PUT', inventoryIntegration, authMethodOptions);

    // /users/me/analytics
    userMeResource.addResource('analytics').addMethod('GET', analyticsIntegration, authMethodOptions);

    // =================================================================
    // SPRINT 5: IOT & TELEMETRY (NEW ADDITIONS)
    // =================================================================

    // 1. DynamoDB Table for Real-Time Cart Telemetry
    // Partition Key: cart_id (String)
    // Sort Key: timestamp (Number)
    // Mode: On-Demand (Pay per request, practically free for dev)
    const telemetryTable = new dynamodb.Table(this, 'CartTelemetryTable', {
      tableName: 'CartTelemetry',
      partitionKey: { name: 'cart_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 2. Ingestion Lambda
    // Receives MQTT message -> Writes to DynamoDB
    const telemetryLambda = new lambdaNodejs.NodejsFunction(this, 'TelemetryHandler', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: 'lambda/telemetryHandler.ts',
      environment: {
        TELEMETRY_TABLE_NAME: telemetryTable.tableName,
      },
      // Note: No VPC needed for DynamoDB access (faster cold starts)
    });

    // Grant Lambda permission to write to DynamoDB
    telemetryTable.grantWriteData(telemetryLambda);

    // 3. IoT Topic Rule
    // Listens to "carts/+/telemetry" (+ is a wildcard for any cart ID)
    // Forwards data to the Lambda
    const telemetryRule = new iot.CfnTopicRule(this, 'TelemetryRule', {
      ruleName: 'CartTelemetryIngestion',
      topicRulePayload: {
        sql: "SELECT * FROM 'carts/+/telemetry'",
        actions: [
          {
            lambda: {
              functionArn: telemetryLambda.functionArn,
            },
          },
        ],
        ruleDisabled: false,
      },
    });

    // Allow IoT Core to invoke the Lambda
    telemetryLambda.addPermission('IoTPermission', {
      principal: new iam.ServicePrincipal('iot.amazonaws.com'),
      sourceArn: telemetryRule.attrArn,
    });

    // =================================================================
    // OUTPUTS
    // =================================================================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });
    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: api.url,
    });
    new cdk.CfnOutput(this, 'BastionHostId', {
      value: bastion.instanceId,
    });
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: dbInstance.dbInstanceEndpointAddress,
    });
    // New Output for Sprint 5
    new cdk.CfnOutput(this, 'TelemetryTableName', {
      value: telemetryTable.tableName,
    });
  }
}