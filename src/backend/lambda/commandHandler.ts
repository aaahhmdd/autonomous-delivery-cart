import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';

// Initialize the IoT Data client
const iotClient = new IoTDataPlaneClient({ region: process.env.AWS_REGION });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    console.log("Received event:", event.body);

    try {
        const cartId = event.pathParameters?.cartId;
        if (!cartId) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing cartId in URL' }) };
        }

        const body = JSON.parse(event.body || '{}');
        const action = body.action; // e.g., "unlock"

        if (!action) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Missing action in payload' }) };
        }

        // The MQTT topic the Jetson Nano will be listening to
        const topic = `carts/${cartId}/command`;
        
        // The message we are sending to the cart
        const payload = JSON.stringify({
            command: action,
            timestamp: new Date().toISOString()
        });

        // Publish to AWS IoT Core
        const publishCmd = new PublishCommand({
            topic: topic,
            payload: Buffer.from(payload),
            qos: 1 // Quality of Service 1 ensures it gets delivered at least once
        });

        await iotClient.send(publishCmd);

        return {
            statusCode: 200,
            headers: { 
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: `Command '${action}' sent to ${cartId} successfully!` })
        };

    } catch (error) {
        console.error("Error publishing IoT command:", error);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ message: 'Failed to send command to the cart', error: String(error) }) 
        };
    }
};