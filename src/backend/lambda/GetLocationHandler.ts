import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

export const handler: APIGatewayProxyHandler = async (event) => {
    const cartId = event.pathParameters?.cartId;
    const tableName = process.env.TABLE_NAME;

    if (!cartId) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing cartId" }) };
    }

    try {
        const command = new GetCommand({
            TableName: tableName,
            Key: { cartId: cartId } // Partition key is the cartId
        });

        const response = await docClient.send(command);

        if (!response.Item) {
            return { statusCode: 404, body: JSON.stringify({ error: "No location data found for this cart" }) };
        }

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(response.Item) 
            // Returns e.g. { cartId: "cart_01", lat: 30.0123, lng: 31.4123, timestamp: 1680000000 }
        };

    } catch (error) {
        console.error("DynamoDB Error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Failed to fetch location" }) };
    }
};