import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,GET',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const cartId = event.pathParameters?.cartId;
    if (!cartId) {
      return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing cartId' }) };
    }

    const tableName = process.env.TELEMETRY_TABLE_NAME;

    // Query DynamoDB for the latest telemetry point for this cart
    const command = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'cart_id = :cartId',
      ExpressionAttributeValues: {
        ':cartId': cartId,
      },
      ScanIndexForward: false, // false = Descending order (newest first)
      Limit: 1, // We only need the latest location
    });

    const response = await docClient.send(command);

    if (!response.Items || response.Items.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ message: 'Cart location not found' }) };
    }

    // Return the latest coordinates and battery level
    return { 
      statusCode: 200, 
      headers, 
      body: JSON.stringify(response.Items[0]) 
    };

  } catch (error) {
    console.error('Tracking API Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal Server Error' }) };
  }
}