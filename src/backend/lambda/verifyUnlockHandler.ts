import { APIGatewayProxyHandler } from 'aws-lambda';
import { Client } from 'pg';
import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';

// Initialize the AWS IoT Data Plane Client
const iotClient = new IoTDataPlaneClient({ region: process.env.AWS_REGION });

export const handler: APIGatewayProxyHandler = async (event) => {
    console.log("Event:", event.body);
    
    // Add CORS headers for the frontend
    const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
    
    const orderId = event.pathParameters?.orderId;
    if (!orderId || !event.body) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing orderId or PIN" }) };
    }

    const { pin } = JSON.parse(event.body);

    // 🔐 THE SSL FIX: We MUST include SSL here too!
    const dbClient = new Client({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: 5432,
        ssl: {
            rejectUnauthorized: false, // Required for AWS RDS
        }
    });

    try {
        await dbClient.connect();

        // 1. Fetch the correct PIN and the assigned cartId for this order
        const query = 'SELECT unlock_pin, cart_id FROM orders WHERE id = $1';
        const result = await dbClient.query(query, [orderId]);

        if (result.rows.length === 0) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: "Order not found" }) };
        }

        const order = result.rows[0];

        // 2. Validate the PIN
        if (order.unlock_pin !== pin) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: "Invalid PIN" }) };
        }

        // 3. PIN matches! Publish the unlock command to AWS IoT Core
        const cartId = order.cart_id || "cart_001";
        const topic = `carts/${cartId}/command`; // Matches Jetson Nano topic
        const payload = {
            command: "unlock",
            orderId: orderId,
            timestamp: new Date().toISOString()
        };

        const publishCmd = new PublishCommand({
            topic: topic,
            payload: Buffer.from(JSON.stringify(payload)),
            qos: 1 // Quality of Service 1 ensures at least once delivery
        });

        await iotClient.send(publishCmd);

        // 4. Mark the Order as Delivered in the Database
        await dbClient.query("UPDATE orders SET status = 'delivered', completed_at = NOW() WHERE id = $1", [orderId]);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: "Doors unlocked successfully!", cartId })
        };

    } catch (error) {
        console.error("Error:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal Server Error", details: String(error) }) };
    } finally {
        await dbClient.end();
    }
};