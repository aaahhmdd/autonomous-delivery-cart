/**
 * This Lambda function handles all API requests related to orders.
 * Version: Cost-$0 (No NAT, no Secrets Manager)
 */

 // --- SDK and Library Imports ---
import { Client } from 'pg';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// --- Environment Variables ---
const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD } = process.env;

/**
 * Main Lambda Handler
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
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
    console.log('Connected to the database successfully');

    // --- 2. Get Cognito User ID ---
    // **FIXED**: Changed event type to v1. No '.jwt' is needed.
    const cognitoUserId = event.requestContext.authorizer?.claims.sub;
    if (!cognitoUserId) {
      return { statusCode: 401, body: JSON.stringify('Unauthorized') };
    }

    // --- 3. Get Internal User ID (from cognito_id) ---
    // **FIXED**: Changed 'user_id' to 'id' to match your schema
    const userRes = await client.query(
      'SELECT id, role FROM users WHERE cognito_id = $1',
      [cognitoUserId]
    );
    if (userRes.rows.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify(
          'User profile not found. Please complete profile.'
        ),
      };
    }
    // **FIXED**: Changed 'user_id' to 'id'
    const internalUserId = userRes.rows[0].id;
    const userRole = userRes.rows[0].role;

    // **FIXED**: v1 event uses 'httpMethod' and 'path' directly on the event
    const httpMethod = event.httpMethod;
    const path = event.path;
    let responseBody: string = '';
    let statusCode = 200;

    // --- 4. Route Logic ---
    if (httpMethod === 'POST' && path === '/orders') {
      // --- Create Order ---
      const body = JSON.parse(event.body || '{}');
      const { vendor_id, delivery_location, total_amount, items } = body;

      if (
        !vendor_id ||
        !delivery_location ||
        !total_amount ||
        !items ||
        (items as any[]).length === 0
      ) {
        return {
          statusCode: 400,
          body: JSON.stringify('Bad Request: Missing required fields'),
        };
      }

      await client.query('BEGIN'); // Start transaction

      const orderQuery = `
        INSERT INTO orders (customer_id, vendor_id, status, delivery_location, total_amount)
        VALUES ($1, $2, 'pending', $3, $4)
        RETURNING id;
      `;
      const orderRes = await client.query(orderQuery, [
        internalUserId, // Use the ID from the cognito lookup
        vendor_id,
        delivery_location,
        total_amount,
      ]);
      const newOrderId = orderRes.rows[0].id;

      for (const item of items as any[]) {
        const itemQuery = `
          INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
          VALUES ($1, $2, $3, $4);
        `;
        await client.query(itemQuery, [
          newOrderId,
          item.product_id,
          item.quantity,
          item.price_at_purchase,
        ]);
      }

      await client.query('COMMIT');
      statusCode = 201;
      responseBody = JSON.stringify({ orderId: newOrderId });

    } else if (httpMethod === 'GET' && path === '/orders') {
      // --- Get All Orders (for a Customer) ---
      const query =
        'SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC';
      const res = await client.query(query, [internalUserId]);
      responseBody = JSON.stringify(res.rows);

    } else if (httpMethod === 'GET' && event.pathParameters?.orderId) {
      // --- Get One Order (for a Customer) ---
      const orderId = event.pathParameters.orderId;

      const orderQuery = 'SELECT * FROM orders WHERE id = $1 AND customer_id = $2';
      const orderRes = await client.query(orderQuery, [orderId, internalUserId]);

      if (orderRes.rows.length === 0) {
        return {
          statusCode: 404,
          body: JSON.stringify('Order not found or access denied'),
        };
      }

      const itemsQuery = `
        SELECT 
          oi.*, 
          p.name as product_name, 
          p.image_url as product_image_url
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
      `;
      const itemsRes = await client.query(itemsQuery, [orderId]);

      const detailedOrder = orderRes.rows[0];
      detailedOrder.items = itemsRes.rows;
      responseBody = JSON.stringify(detailedOrder);
    
    // =================================================================
    // --- NEW LOGIC FOR SPRINT 3 ---
    // =================================================================
    } else if (
        httpMethod === 'GET' && 
        path.startsWith('/vendors/') && 
        path.endsWith('/orders')
    ) {
      // --- Get All Orders (for a Vendor) ---
      // This handles GET /vendors/{id}/orders
      
      const vendorIdFromPath = event.pathParameters?.id;
      
      // Security Check: Is the logged-in user a 'vendor' and are they
      // requesting their *own* orders?
      if (userRole !== 'vendor') {
         return { statusCode: 403, body: JSON.stringify('Forbidden: Not a vendor') };
      }
      
      // We look up the vendor's *internal* ID using their cognito ID
      // and check if it matches the ID in the path.
      // Note: This assumes the {id} in the path is the internal 'id', not the cognito_id.
      if (internalUserId.toString() !== vendorIdFromPath) {
         console.warn(`SECURITY: Vendor ${internalUserId} tried to access orders for ${vendorIdFromPath}`);
         return { statusCode: 403, body: JSON.stringify('Forbidden: Access denied') };
      }

      const query =
        'SELECT * FROM orders WHERE vendor_id = $1 ORDER BY created_at DESC';
      const res = await client.query(query, [internalUserId]);
      responseBody = JSON.stringify(res.rows);
      
    } else {
      statusCode = 405;
      responseBody = JSON.stringify('Method Not Allowed');
    }

    // --- 5. Return Response ---
    return {
      statusCode,
      body: responseBody,
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (err) {
    console.error('Lambda handler failed:', err);

    if (client) {
      try {
        await client.query('ROLLBACK');
        console.log('Transaction rolled back');
      } catch (rollbackErr) {
        console.error('Error rolling back transaction:', rollbackErr);
      }
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: (err as Error).message,
      }),
    };
  } finally {
    // --- 6. Close Connection ---
    if (client) {
      await client.end();
      console.log('Database connection closed');
    }
  }
}

