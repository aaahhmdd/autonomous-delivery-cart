    import * as cdk from 'aws-cdk-lib';
    import { Construct } from 'constructs';
    // 1. Import the S3 library from the CDK
    import * as s3 from 'aws-cdk-lib/aws-s3';
    
    export class BackendStack extends cdk.Stack {
      constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);
    
        // 2. Define a new S3 Bucket resource
        new s3.Bucket(this, 'MyFirstGradProjectBucket', {
          // NOTE: S3 bucket names must be globally unique. 
          // If you leave 'bucketName' out, the CDK will automatically generate a unique name for you, which is best practice.
          
          // This setting is VERY important for development. It ensures that when you
          // run `cdk destroy`, the bucket and all its contents will be automatically deleted.
          // Without this, you could be left with orphaned resources.
          removalPolicy: cdk.RemovalPolicy.DESTROY,
          autoDeleteObjects: true, 
        });
      }
    }
    



