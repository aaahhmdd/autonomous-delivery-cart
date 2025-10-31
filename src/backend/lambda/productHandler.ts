/**
 * This Lambda function handles all API requests related to products.
 * Specifically: GET /vendors/{id}/products
 * Version: Cost-$0 (No NAT, no Secrets Manager)
 */

// --- SDK and Library Imports ---
import { Client } from 'pg';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

// --- Environment Variables ---
// Directly use plaintext env vars (passed from CDK)
// **FIXED**: Removed extra '}' bracket
const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD } = process.env;

/**
 * Main entry point for the Lambda function.
 */
export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  console.log('Event:', JSON.stringify(event, null, 2));

  let client: Client | undefined;

  try {
    // --- 1. Connect to the PostgreSQL Database ---
    client = new Client({
      host: DB_HOST,
      port: 5432,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();
    console.log('Connected to database successfully');

    const httpMethod = event.requestContext.http.method;

    // --- 2. Handle GET /vendors/{id}/products ---
    if (httpMethod === 'GET') {
      // **FIXED**: Changed 'vendorId' to 'id' to match the CDK API Gateway path
      const vendorId = event.pathParameters?.id;

      if (!vendorId) {
        return {
          statusCode: 400,
          body: JSON.stringify('Bad Request: Missing vendorId'),
        };
      }

      const query = `
        SELECT 
          p.id, 
          p.name, 
          p.description, 
          p.sku,
          p.image_url,
          i.price, 
          i.quantity_in_stock 
        FROM products p
        JOIN inventories i ON p.id = i.product_id
        WHERE i.vendor_id = $1;
      `;

      const res = await client.query(query, [vendorId]);

      return {
        statusCode: 200,
        body: JSON.stringify(res.rows),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    // --- 3. Handle Unsupported Methods ---
    return {
      statusCode: 405,
      body: JSON.stringify({ error: `Unsupported method: ${httpMethod}` }),
    };
  } catch (err) {
    console.error('Lambda handler failed:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: (err as Error).message,
      }),
    };
  } finally {
    // --- 4. Close the DB Connection ---
    if (client) {
      await client.end();
      console.log('Database connection closed');
    }
  }
}