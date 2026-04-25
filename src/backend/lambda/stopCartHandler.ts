import { APIGatewayProxyHandler } from 'aws-lambda';
import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';

const iotClient = new IoTDataPlaneClient({ region: process.env.AWS_REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
    const cartId = event.pathParameters?.cartId;
    
    if (!cartId) {
        return { statusCode: 400, body: JSON.stringify({ error: "Missing cartId" }) };
    }

    try {
        // Publish emergency stop command to IoT Core
        const topic = `carta/${cartId}/commands`;
        const payload = {
            command: "emergency_stop",
            timestamp: Date.now(),
            reason: "Manager Initiated E-Stop"
        };

        const publishCmd = new PublishCommand({
            topic: topic,
            payload: Buffer.from(JSON.stringify(payload)),
            qos: 1 
        });

        await iotClient.send(publishCmd);

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: `EMERGENCY STOP command sent to ${cartId}` })
        };

    } catch (error) {
        console.error("IoT Publish Error:", error);
        return { statusCode: 500, body: JSON.stringify({ error: "Failed to send E-Stop command" }) };
    }
};