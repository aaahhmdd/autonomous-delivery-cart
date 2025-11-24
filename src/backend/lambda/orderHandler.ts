/*

/**
 * This Lambda function handles all API requests related to orders.
 * Version: Cost-$0 (No NAT, no Secrets Manager)


 // --- SDK and Library Imports ---
import { Client } from 'pg';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// --- Environment Variables ---
const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD } = process.env;

/**
 * Main Lambda Handler

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

*/



// sprint 3


/*

// **FIX 1: Remove `Client` import, add `getPool` import**
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';

type OrderItem = {
  product_id: number;
  quantity: number;
};

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // **FIX 2: Get the pool and connect a client**
  const pool = getPool();
  const client = await pool.connect();
  console.log('Successfully connected client from pool');

  try {
    // --- auth: Cognito sub ---
    const cognitoUserId = event.requestContext.authorizer?.claims.sub;
    if (!cognitoUserId) {
      return { statusCode: 401, body: JSON.stringify('Unauthorized') };
    }

    const httpMethod = event.httpMethod;
    const path = event.path;

    if (httpMethod === 'POST' && path === '/orders') {
      const body = JSON.parse(event.body || '{}');

      const idempotencyKey =
        (event.headers && (event.headers['Idempotency-Key'] || event.headers['idempotency-key'])) ||
        body.idempotency_key ||
        null;

      const vendor_id = body.vendor_id;
      const delivery_location = body.delivery_location;
      const items = body.items as OrderItem[] | undefined;

      if (!vendor_id || !delivery_location || !items || !Array.isArray(items) || items.length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify('Bad Request: Missing required fields (vendor_id, delivery_location, items)'),
        };
      }

      const userRes = await client.query('SELECT id, role FROM users WHERE cognito_id = $1', [cognitoUserId]);
      if (userRes.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify('User profile not found. Please complete profile.') };
      }
      const internalUserId = userRes.rows[0].id;

      if (idempotencyKey) {
        const existing = await client.query(
          'SELECT id, status, total_amount FROM orders WHERE idempotency_key = $1 AND customer_id = $2',
          [idempotencyKey, internalUserId]
        );
        if (existing.rows.length > 0) {
          return {
            statusCode: 200,
            body: JSON.stringify({ orderId: existing.rows[0].id, status: existing.rows[0].status, total_amount: existing.rows[0].total_amount }),
          };
        }
      }

      // --- 1) Recompute total server-side ---
      const productIds = items.map((it) => Number(it.product_id));
      const q = `
        SELECT product_id, price
        FROM inventories
        WHERE vendor_id = $1 AND product_id = ANY($2::int[])
      `;
      const invRes = await client.query(q, [vendor_id, productIds]);
      const priceMap = new Map<number, number>();
      invRes.rows.forEach((r: any) => priceMap.set(Number(r.product_id), Number(r.price)));

      let computedTotal = 0;
      for (const it of items) {
        const pid = Number(it.product_id);
        const qty = Number(it.quantity);
        const price = priceMap.get(pid);
        if (price === undefined) {
          return { statusCode: 400, body: JSON.stringify(`Bad Request: product ${pid} not found for vendor ${vendor_id}`) };
        }
        if (!Number.isFinite(qty) || qty <= 0) {
          return { statusCode: 400, body: JSON.stringify(`Bad Request: invalid quantity for product ${pid}`) };
        }
        computedTotal += price * qty;
      }

      // --- 2) Create order and items in transaction ---
      try {
        await client.query('BEGIN');

        const orderInsert = `
          INSERT INTO orders (customer_id, vendor_id, status, delivery_location, total_amount, created_at, updated_at, idempotency_key)
          VALUES ($1, $2, 'pending', $3, $4, NOW(), NOW(), $5)
          RETURNING id, created_at;
        `;
        const orderRes = await client.query(orderInsert, [internalUserId, vendor_id, delivery_location, computedTotal, idempotencyKey]);
        const newOrderId = orderRes.rows[0].id;

        const insertItemText = `
          INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase)
          VALUES ($1, $2, $3, $4)
        `;
        for (const it of items) {
          const pid = Number(it.product_id);
          const qty = Number(it.quantity);
          const price = priceMap.get(pid)!;
          await client.query(insertItemText, [newOrderId, pid, qty, price]);
        }

        await client.query('COMMIT');
        return {
          statusCode: 201,
          body: JSON.stringify({ orderId: newOrderId, total_amount: computedTotal }),
          headers: { 'Content-Type': 'application/json' },
        };
      } catch (txErr) {
        await client.query('ROLLBACK');
        console.error('Transaction error:', txErr);
        return { statusCode: 500, body: JSON.stringify('Internal Server Error during order creation') };
      }
    }

    // --- GET /orders (customer) ---
    if (httpMethod === 'GET' && path === '/orders') {
      const userRes = await client.query('SELECT id FROM users WHERE cognito_id = $1', [cognitoUserId]);
      if (userRes.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify('User profile not found') };
      }
      const uid = userRes.rows[0].id;
      const res = await client.query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC', [uid]);
      return { statusCode: 200, body: JSON.stringify(res.rows), headers: { 'Content-Type': 'application/json' } };
    }

    // --- GET /orders/{orderId} ---
    if (httpMethod === 'GET' && event.pathParameters?.orderId) {
      const orderId = event.pathParameters.orderId;
      const userRes = await client.query('SELECT id FROM users WHERE cognito_id = $1', [cognitoUserId]);
      const uid = userRes.rows[0].id;
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [orderId, uid]);
      if (orderRes.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify('Order not found or access denied') };
      }
      const itemsRes = await client.query(
        `SELECT oi.*, p.name as product_name, p.image_url as product_image_url
         FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1`,
        [orderId]
      );
      const detailed = orderRes.rows[0];
      detailed.items = itemsRes.rows;
      return { statusCode: 200, body: JSON.stringify(detailed), headers: { 'Content-Type': 'application/json' } };
    }

    // --- GET /vendors/{id}/orders (vendor) ---
    if (httpMethod === 'GET' && path.startsWith('/vendors/') && path.endsWith('/orders')) {
      const vendorIdFromPath = event.pathParameters?.id;
      const userRes = await client.query('SELECT id, role FROM users WHERE cognito_id = $1', [cognitoUserId]);
      if (userRes.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify('User profile not found') };
      }
      const internalUserId = userRes.rows[0].id;
      const userRole = userRes.rows[0].role;
      if (userRole !== 'vendor' || internalUserId.toString() !== vendorIdFromPath) {
        return { statusCode: 403, body: JSON.stringify('Forbidden: Not a vendor or access denied') };
      }
      const res = await client.query('SELECT * FROM orders WHERE vendor_id = $1 ORDER BY created_at DESC', [internalUserId]);
      return { statusCode: 200, body: JSON.stringify(res.rows), headers: { 'Content-Type': 'application/json' } };
    }

    return { statusCode: 405, body: JSON.stringify('Method Not Allowed') };
  } catch (err) {
    console.error('Lambda handler error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error', message: (err as Error).message }) };
  } finally {
    // **FIX 3: Release client back to pool instead of ending it**
    if (client) {
      client.release();
      console.log('Database client released back to pool');
    }
  }
}
*/
/*
// sprint 4

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';
import { PoolClient } from 'pg';

type OrderItem = {
  product_id: number;
  quantity: number;
};

// Helper to check if a user is a vendor and owns the resource
async function authorizeVendor(client: PoolClient, cognitoUserId: string, vendorIdFromPath: string | undefined): Promise<number> {
    const userRes = await client.query('SELECT id, role FROM users WHERE cognito_id = $1', [cognitoUserId]);
    if (userRes.rows.length === 0) {
      throw new Error('User profile not found');
    }
    const internalUserId = userRes.rows[0].id;
    const userRole = userRes.rows[0].role;
    
    if (userRole !== 'vendor') {
         throw new Error('Forbidden: User is not a vendor');
    }
    if (internalUserId.toString() !== vendorIdFromPath) {
       throw new Error('Forbidden: Vendor ID does not match authenticated user');
    }
    return internalUserId;
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const pool = getPool();
  const client = await pool.connect();
  console.log('Successfully connected client from pool');

  try {
    const cognitoUserId = event.requestContext.authorizer?.claims.sub;
    if (!cognitoUserId) {
      return { statusCode: 401, body: JSON.stringify('Unauthorized') };
    }

    const httpMethod = event.httpMethod;
    const path = event.path;

    // --- POST /orders ---
    if (httpMethod === 'POST' && path === '/orders') {
      const body = JSON.parse(event.body || '{}');
      // ... (Idempotency logic) ...
      const idempotencyKey =
        (event.headers && (event.headers['Idempotency-Key'] || event.headers['idempotency-key'])) ||
        body.idempotency_key ||
        null;

      const { vendor_id, delivery_location, items } = body as { vendor_id: number, delivery_location: string, items: OrderItem[] | undefined };

      if (!vendor_id || !delivery_location || !items || !Array.isArray(items) || items.length === 0) {
        return { statusCode: 400, body: JSON.stringify('Bad Request: Missing required fields')};
      }
      
      const userRes = await client.query('SELECT id FROM users WHERE cognito_id = $1', [cognitoUserId]);
      if (userRes.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify('User profile not found') };
      }
      const internalUserId = userRes.rows[0].id;

      // ... (Idempotency check) ...
      if (idempotencyKey) {
        const existing = await client.query(
          'SELECT id, status, total_amount FROM orders WHERE idempotency_key = $1 AND customer_id = $2',
          [idempotencyKey, internalUserId]
        );
        if (existing.rows.length > 0) {
          return { statusCode: 200, body: JSON.stringify(existing.rows[0]) };
        }
      }

      // --- 1) Recompute total server-side ---
      const productIds = items.map((it) => Number(it.product_id));
      const invRes = await client.query(
        'SELECT product_id, price FROM inventories WHERE vendor_id = $1 AND product_id = ANY($2::int[])',
        [vendor_id, productIds]
      );
      const priceMap = new Map<number, number>(invRes.rows.map(r => [Number(r.product_id), Number(r.price)]));

      let computedTotal = 0;
      for (const it of items) {
        const price = priceMap.get(Number(it.product_id));
        if (price === undefined) {
          return { statusCode: 400, body: JSON.stringify(`Bad Request: product ${it.product_id} not found for vendor ${vendor_id}`) };
        }
        computedTotal += price * Number(it.quantity);
      }

      // --- 2) Create order and items in transaction ---
      try {
        await client.query('BEGIN');
        const orderInsert = `
          INSERT INTO orders (customer_id, vendor_id, status, delivery_location, total_amount, idempotency_key)
          VALUES ($1, $2, 'pending', $3, $4, $5)
          RETURNING id, created_at;
        `;
        const orderRes = await client.query(orderInsert, [internalUserId, vendor_id, delivery_location, computedTotal, idempotencyKey]);
        const newOrderId = orderRes.rows[0].id;

        const insertItemText = 'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, $3, $4)';
        for (const it of items) {
          const price = priceMap.get(Number(it.product_id))!;
          await client.query(insertItemText, [newOrderId, Number(it.product_id), Number(it.quantity), price]);
        }

        await client.query('COMMIT');
        return {
          statusCode: 201,
          body: JSON.stringify({ orderId: newOrderId, total_amount: computedTotal }),
        };
      } catch (txErr) {
        await client.query('ROLLBACK');
        console.error('Transaction error:', txErr);
        return { statusCode: 500, body: JSON.stringify('Internal Server Error during order creation') };
      }
    }

    // --- GET /orders (customer) ---
    if (httpMethod === 'GET' && path === '/orders') {
      const userRes = await client.query('SELECT id FROM users WHERE cognito_id = $1', [cognitoUserId]);
      if (userRes.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify('User profile not found') };
      }
      const uid = userRes.rows[0].id;
      const res = await client.query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC', [uid]);
      return { statusCode: 200, body: JSON.stringify(res.rows), headers: { 'Content-Type': 'application/json' } };
    }
    
    // --- *** SPRINT 4: NEW ENDPOINT LOGIC *** ---
    // --- PUT /orders/{orderId}/status ---
    if (httpMethod === 'PUT' && event.pathParameters?.orderId && path.endsWith('/status')) {
      const orderId = event.pathParameters.orderId;
      const body = JSON.parse(event.body || '{}');
      const { status } = body;
      
      const allowedStatus = ['pending', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled'];
      if (!status || !allowedStatus.includes(status)) {
         return { statusCode: 400, body: JSON.stringify(`Bad Request: Invalid status. Must be one of: ${allowedStatus.join(', ')}`) };
      }
      
      // 1. Get vendor ID from cognito
      const userRes = await client.query('SELECT id, role FROM users WHERE cognito_id = $1', [cognitoUserId]);
      if (userRes.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify('User profile not found') };
      }
      if (userRes.rows[0].role !== 'vendor') {
         return { statusCode: 403, body: JSON.stringify('Forbidden: User is not a vendor') };
      }
      const vendorId = userRes.rows[0].id;

      // 2. Update order status, *but only if the order belongs to this vendor*
      const updateQuery = `
        UPDATE orders SET status = $1, updated_at = NOW()
        WHERE id = $2 AND vendor_id = $3
        RETURNING *;
      `;
      const res = await client.query(updateQuery, [status, orderId, vendorId]);
      
      if (res.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify('Order not found or access denied') };
      }
      
      return { statusCode: 200, body: JSON.stringify(res.rows[0]), headers: { 'Content-Type': 'application/json' } };
    }

    // --- GET /orders/{orderId} (customer) ---
    if (httpMethod === 'GET' && event.pathParameters?.orderId) {
      const orderId = event.pathParameters.orderId;
      const userRes = await client.query('SELECT id FROM users WHERE cognito_id = $1', [cognitoUserId]);
      const uid = userRes.rows[0].id;
      // Note: This logic assumes only CUSTOMERS use this endpoint. A vendor would use GET /vendors/{id}/orders
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [orderId, uid]);
      if (orderRes.rows.length === 0) {
        return { statusCode: 404, body: JSON.stringify('Order not found or access denied') };
      }
      const itemsRes = await client.query(
        `SELECT oi.*, p.name as product_name, p.image_url as product_image_url
         FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1`,
        [orderId]
      );
      const detailed = orderRes.rows[0];
      detailed.items = itemsRes.rows;
      return { statusCode: 200, body: JSON.stringify(detailed), headers: { 'Content-Type': 'application/json' } };
    }

    // --- GET /vendors/{id}/orders (vendor) ---
    if (httpMethod === 'GET' && path.startsWith('/vendors/') && path.endsWith('/orders')) {
      const vendorIdFromPath = event.pathParameters?.id;
      // This helper function throws an error if auth fails
      const internalUserId = await authorizeVendor(client, cognitoUserId, vendorIdFromPath);
      
      const res = await client.query('SELECT * FROM orders WHERE vendor_id = $1 ORDER BY created_at DESC', [internalUserId]);
      return { statusCode: 200, body: JSON.stringify(res.rows), headers: { 'Content-Type': 'application/json' } };
    }

    return { statusCode: 405, body: JSON.stringify('Method Not Allowed') };
  } catch (err) {
    console.error('Lambda handler error:', err);
    const error = err as Error;
     if (error.message.includes('Forbidden')) {
        return { statusCode: 403, body: JSON.stringify(error.message) };
    }
    if (error.message.includes('not found')) {
        return { statusCode: 404, body: JSON.stringify(error.message) };
    }
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error', message: (err as Error).message }) };
  } finally {
    client.release();
    console.log('Database client released back to pool');
  }
}

*/


// sprint 4 - v1 

/*

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';
import { PoolClient } from 'pg';

// --- HELPER: Standard CORS Headers ---
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // Allow any origin
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Idempotency-Key',
};

type OrderItem = {
  product_id: number;
  quantity: number;
};

// Helper to check if a user is a vendor and owns the resource
async function authorizeVendor(client: PoolClient, cognitoUserId: string, vendorIdFromPath: string | undefined): Promise<number> {
    const userRes = await client.query('SELECT id, role FROM users WHERE cognito_id = $1', [cognitoUserId]);
    if (userRes.rows.length === 0) {
      throw new Error('User profile not found');
    }
    const internalUserId = userRes.rows[0].id;
    const userRole = userRes.rows[0].role;
    
    if (userRole !== 'vendor') {
         throw new Error('Forbidden: User is not a vendor');
    }
    if (internalUserId.toString() !== vendorIdFromPath) {
       throw new Error('Forbidden: Vendor ID does not match authenticated user');
    }
    return internalUserId;
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const pool = getPool();
  const client = await pool.connect();

  try {
    const cognitoUserId = event.requestContext.authorizer?.claims.sub;
    if (!cognitoUserId) {
      return { statusCode: 401, headers, body: JSON.stringify('Unauthorized') };
    }

    const httpMethod = event.httpMethod;
    const path = event.path;

    // --- POST /orders (Customer creates order) ---
    if (httpMethod === 'POST' && path === '/orders') {
      const body = JSON.parse(event.body || '{}');
      
      const idempotencyKey =
        (event.headers && (event.headers['Idempotency-Key'] || event.headers['idempotency-key'])) ||
        body.idempotency_key ||
        null;

      const { vendor_id, delivery_location, items } = body as { vendor_id: number, delivery_location: string, items: OrderItem[] | undefined };

      if (!vendor_id || !delivery_location || !items || !Array.isArray(items) || items.length === 0) {
        return { statusCode: 400, headers, body: JSON.stringify('Bad Request: Missing required fields')};
      }
      
      const userRes = await client.query('SELECT id FROM users WHERE cognito_id = $1', [cognitoUserId]);
      if (userRes.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify('User profile not found') };
      }
      const internalUserId = userRes.rows[0].id;

      // Idempotency check
      if (idempotencyKey) {
        const existing = await client.query(
          'SELECT id, status, total_amount FROM orders WHERE idempotency_key = $1 AND customer_id = $2',
          [idempotencyKey, internalUserId]
        );
        if (existing.rows.length > 0) {
          return { statusCode: 200, headers, body: JSON.stringify(existing.rows[0]) };
        }
      }

      // 1) Recompute total server-side
      const productIds = items.map((it) => Number(it.product_id));
      const invRes = await client.query(
        'SELECT product_id, price FROM inventories WHERE vendor_id = $1 AND product_id = ANY($2::int[])',
        [vendor_id, productIds]
      );
      const priceMap = new Map<number, number>(invRes.rows.map(r => [Number(r.product_id), Number(r.price)]));

      let computedTotal = 0;
      for (const it of items) {
        const price = priceMap.get(Number(it.product_id));
        if (price === undefined) {
          return { statusCode: 400, headers, body: JSON.stringify(`Bad Request: product ${it.product_id} not found for vendor ${vendor_id}`) };
        }
        computedTotal += price * Number(it.quantity);
      }

      // 2) Create order and items in transaction
      try {
        await client.query('BEGIN');
        const orderInsert = `
          INSERT INTO orders (customer_id, vendor_id, status, delivery_location, total_amount, idempotency_key)
          VALUES ($1, $2, 'pending', $3, $4, $5)
          RETURNING id, created_at;
        `;
        const orderRes = await client.query(orderInsert, [internalUserId, vendor_id, delivery_location, computedTotal, idempotencyKey]);
        const newOrderId = orderRes.rows[0].id;

        const insertItemText = 'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, $3, $4)';
        for (const it of items) {
          const price = priceMap.get(Number(it.product_id))!;
          await client.query(insertItemText, [newOrderId, Number(it.product_id), Number(it.quantity), price]);
        }

        await client.query('COMMIT');
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify({ orderId: newOrderId, total_amount: computedTotal }),
        };
      } catch (txErr) {
        await client.query('ROLLBACK');
        console.error('Transaction error:', txErr);
        return { statusCode: 500, headers, body: JSON.stringify('Internal Server Error during order creation') };
      }
    }

    // --- GET /orders (Customer list) ---
    if (httpMethod === 'GET' && path === '/orders') {
      const userRes = await client.query('SELECT id FROM users WHERE cognito_id = $1', [cognitoUserId]);
      if (userRes.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify('User profile not found') };
      }
      const uid = userRes.rows[0].id;
      const res = await client.query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC', [uid]);
      return { statusCode: 200, headers, body: JSON.stringify(res.rows) };
    }

    // --- GET /orders/{orderId} (Customer details) ---
    if (httpMethod === 'GET' && event.pathParameters?.orderId) {
      const orderId = event.pathParameters.orderId;
      const userRes = await client.query('SELECT id FROM users WHERE cognito_id = $1', [cognitoUserId]);
      const uid = userRes.rows[0].id;
      
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [orderId, uid]);
      if (orderRes.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify('Order not found or access denied') };
      }
      
      const itemsRes = await client.query(
        `SELECT oi.*, p.name as product_name, p.image_url as product_image_url
         FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1`,
        [orderId]
      );
      const detailed = orderRes.rows[0];
      detailed.items = itemsRes.rows;
      return { statusCode: 200, headers, body: JSON.stringify(detailed) };
    }

    // --- GET /vendors/{id}/orders (Vendor list) ---
    if (httpMethod === 'GET' && path.startsWith('/vendors/') && path.endsWith('/orders')) {
      const vendorIdFromPath = event.pathParameters?.id;
      // This helper function throws an error if auth fails
      const internalUserId = await authorizeVendor(client, cognitoUserId, vendorIdFromPath);
      
      const res = await client.query('SELECT * FROM orders WHERE vendor_id = $1 ORDER BY created_at DESC', [internalUserId]);
      return { statusCode: 200, headers, body: JSON.stringify(res.rows) };
    }
    
    // --- PUT /orders/{orderId}/status (Vendor update) ---
    if (httpMethod === 'PUT' && event.pathParameters?.orderId && path.endsWith('/status')) {
      const orderId = event.pathParameters.orderId;
      const body = JSON.parse(event.body || '{}');
      const { status } = body;
      
      const allowedStatus = ['pending', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled'];
      if (!status || !allowedStatus.includes(status)) {
         return { statusCode: 400, headers, body: JSON.stringify(`Bad Request: Invalid status.`) };
      }
      
      // 1. Get vendor ID from cognito
      const userRes = await client.query('SELECT id, role FROM users WHERE cognito_id = $1', [cognitoUserId]);
      if (userRes.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify('User profile not found') };
      }
      if (userRes.rows[0].role !== 'vendor') {
         return { statusCode: 403, headers, body: JSON.stringify('Forbidden: User is not a vendor') };
      }
      const vendorId = userRes.rows[0].id;

      // 2. Update order status
      const updateQuery = `
        UPDATE orders SET status = $1, updated_at = NOW()
        WHERE id = $2 AND vendor_id = $3
        RETURNING *;
      `;
      const res = await client.query(updateQuery, [status, orderId, vendorId]);
      
      if (res.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify('Order not found or access denied') };
      }
      
      return { statusCode: 200, headers, body: JSON.stringify(res.rows[0]) };
    }

    return { statusCode: 405, headers, body: JSON.stringify('Method Not Allowed') };
  } catch (err) {
    console.error('Lambda handler error:', err);
    const error = err as Error;
     if (error.message.includes('Forbidden')) {
        return { statusCode: 403, headers, body: JSON.stringify(error.message) };
    }
    if (error.message.includes('not found')) {
        return { statusCode: 404, headers, body: JSON.stringify(error.message) };
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error', message: (err as Error).message }) };
  } finally {
    client.release();
  }
}

*/ 


// sprint 4 - v2



import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';
import { PoolClient } from 'pg';

// --- HELPER: Standard CORS Headers ---
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // Allow any origin
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Idempotency-Key',
};

type OrderItem = {
  product_id: number;
  quantity: number;
};

// Helper to check if a user is a vendor and owns the resource
async function authorizeVendor(client: PoolClient, cognitoUserId: string, vendorIdFromPath: string | undefined): Promise<number> {
    const userRes = await client.query('SELECT id, role FROM users WHERE cognito_id = $1', [cognitoUserId]);
    if (userRes.rows.length === 0) {
      throw new Error('User profile not found');
    }
    const internalUserId = userRes.rows[0].id;
    const userRole = userRes.rows[0].role;
    
    if (userRole !== 'vendor') {
         throw new Error('Forbidden: User is not a vendor');
    }
    if (internalUserId.toString() !== vendorIdFromPath) {
       throw new Error('Forbidden: Vendor ID does not match authenticated user');
    }
    return internalUserId;
}

export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const pool = getPool();
  const client = await pool.connect();

  try {
    const cognitoUserId = event.requestContext.authorizer?.claims.sub;
    if (!cognitoUserId) {
      return { statusCode: 401, headers, body: JSON.stringify('Unauthorized') };
    }

    const httpMethod = event.httpMethod;
    const path = event.path;

    // --- POST /orders (Customer creates order) ---
    if (httpMethod === 'POST' && path === '/orders') {
      const body = JSON.parse(event.body || '{}');
      
      const idempotencyKey =
        (event.headers && (event.headers['Idempotency-Key'] || event.headers['idempotency-key'])) ||
        body.idempotency_key ||
        null;

      const { vendor_id, delivery_location, items } = body as { vendor_id: number, delivery_location: string, items: OrderItem[] | undefined };

      if (!vendor_id || !delivery_location || !items || !Array.isArray(items) || items.length === 0) {
        return { statusCode: 400, headers, body: JSON.stringify('Bad Request: Missing required fields')};
      }
      
      const userRes = await client.query('SELECT id FROM users WHERE cognito_id = $1', [cognitoUserId]);
      if (userRes.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify('User profile not found') };
      }
      const internalUserId = userRes.rows[0].id;

      // Idempotency check
      if (idempotencyKey) {
        const existing = await client.query(
          'SELECT id, status, total_amount FROM orders WHERE idempotency_key = $1 AND customer_id = $2',
          [idempotencyKey, internalUserId]
        );
        if (existing.rows.length > 0) {
          return { statusCode: 200, headers, body: JSON.stringify(existing.rows[0]) };
        }
      }

      // 1) Recompute total server-side & Validate Stock
      const productIds = items.map((it) => Number(it.product_id));
      const invRes = await client.query(
        'SELECT product_id, price, quantity_in_stock FROM inventories WHERE vendor_id = $1 AND product_id = ANY($2::int[])',
        [vendor_id, productIds]
      );
      
      // Create maps for price and stock
      const priceMap = new Map<number, number>();
      const stockMap = new Map<number, number>();
      
      invRes.rows.forEach(r => {
          priceMap.set(Number(r.product_id), Number(r.price));
          stockMap.set(Number(r.product_id), Number(r.quantity_in_stock));
      });

      let computedTotal = 0;
      for (const it of items) {
        const pid = Number(it.product_id);
        const qty = Number(it.quantity);
        const price = priceMap.get(pid);
        const stock = stockMap.get(pid);

        if (price === undefined) {
          return { statusCode: 400, headers, body: JSON.stringify(`Bad Request: product ${pid} not found for vendor ${vendor_id}`) };
        }
        
        // Check Stock Availability
        if (stock === undefined || stock < qty) {
             return { statusCode: 409, headers, body: JSON.stringify(`Conflict: Not enough stock for product ${pid}. Available: ${stock}`) };
        }

        computedTotal += price * qty;
      }

      // 2) Create order, insert items, AND UPDATE STOCK in transaction
      try {
        await client.query('BEGIN');
        
        // A. Insert Order
        const orderInsert = `
          INSERT INTO orders (customer_id, vendor_id, status, delivery_location, total_amount, idempotency_key)
          VALUES ($1, $2, 'pending', $3, $4, $5)
          RETURNING id, created_at;
        `;
        const orderRes = await client.query(orderInsert, [internalUserId, vendor_id, delivery_location, computedTotal, idempotencyKey]);
        const newOrderId = orderRes.rows[0].id;

        const insertItemText = 'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES ($1, $2, $3, $4)';
        
        // B. Update Inventory (Decrement Stock)
        const updateStockText = 'UPDATE inventories SET quantity_in_stock = quantity_in_stock - $1 WHERE vendor_id = $2 AND product_id = $3';

        for (const it of items) {
          const pid = Number(it.product_id);
          const qty = Number(it.quantity);
          const price = priceMap.get(pid)!;
          
          // Insert Item
          await client.query(insertItemText, [newOrderId, pid, qty, price]);
          
          // Decrement Stock
          await client.query(updateStockText, [qty, vendor_id, pid]);
        }

        await client.query('COMMIT');
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify({ orderId: newOrderId, total_amount: computedTotal }),
        };
      } catch (txErr) {
        await client.query('ROLLBACK');
        console.error('Transaction error:', txErr);
        return { statusCode: 500, headers, body: JSON.stringify('Internal Server Error during order creation') };
      }
    }

    // --- GET /orders (Customer list) ---
    if (httpMethod === 'GET' && path === '/orders') {
      const userRes = await client.query('SELECT id FROM users WHERE cognito_id = $1', [cognitoUserId]);
      if (userRes.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify('User profile not found') };
      }
      const uid = userRes.rows[0].id;
      const res = await client.query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC', [uid]);
      return { statusCode: 200, headers, body: JSON.stringify(res.rows) };
    }

    // --- GET /orders/{orderId} (Customer details) ---
    if (httpMethod === 'GET' && event.pathParameters?.orderId) {
      const orderId = event.pathParameters.orderId;
      const userRes = await client.query('SELECT id FROM users WHERE cognito_id = $1', [cognitoUserId]);
      const uid = userRes.rows[0].id;
      
      const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [orderId, uid]);
      if (orderRes.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify('Order not found or access denied') };
      }
      
      const itemsRes = await client.query(
        `SELECT oi.*, p.name as product_name, p.image_url as product_image_url
         FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1`,
        [orderId]
      );
      const detailed = orderRes.rows[0];
      detailed.items = itemsRes.rows;
      return { statusCode: 200, headers, body: JSON.stringify(detailed) };
    }

    // --- GET /vendors/{id}/orders (Vendor list) ---
    if (httpMethod === 'GET' && path.startsWith('/vendors/') && path.endsWith('/orders')) {
      const vendorIdFromPath = event.pathParameters?.id;
      // This helper function throws an error if auth fails
      const internalUserId = await authorizeVendor(client, cognitoUserId, vendorIdFromPath);
      
      const res = await client.query('SELECT * FROM orders WHERE vendor_id = $1 ORDER BY created_at DESC', [internalUserId]);
      return { statusCode: 200, headers, body: JSON.stringify(res.rows) };
    }
    
    // --- PUT /orders/{orderId}/status (Vendor update) ---
    if (httpMethod === 'PUT' && event.pathParameters?.orderId && path.endsWith('/status')) {
      const orderId = event.pathParameters.orderId;
      const body = JSON.parse(event.body || '{}');
      const { status } = body;
      
      const allowedStatus = ['pending', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];
      if (!status || !allowedStatus.includes(status)) {
         return { statusCode: 400, headers, body: JSON.stringify(`Bad Request: Invalid status.`) };
      }
      
      // 1. Get vendor ID from cognito
      const userRes = await client.query('SELECT id, role FROM users WHERE cognito_id = $1', [cognitoUserId]);
      if (userRes.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify('User profile not found') };
      }
      if (userRes.rows[0].role !== 'vendor') {
         return { statusCode: 403, headers, body: JSON.stringify('Forbidden: User is not a vendor') };
      }
      const vendorId = userRes.rows[0].id;

      // 2. Update order status AND timestamps logic
      // - If status 'out_for_delivery' -> set dispatched_at
      // - If status 'delivered' -> set completed_at. 
      //   PLUS: If dispatched_at was somehow null (skipped step), fill it now too.
      
      const updateQuery = `
        UPDATE orders 
        SET 
            status = $1::order_status, 
            updated_at = NOW(),
            dispatched_at = CASE 
                WHEN $1::text = 'out_for_delivery' THEN NOW() 
                WHEN $1::text = 'delivered' AND dispatched_at IS NULL THEN NOW()
                ELSE dispatched_at 
            END,
            completed_at = CASE 
                WHEN $1::text = 'delivered' THEN NOW() 
                ELSE completed_at 
            END
        WHERE id = $2 AND vendor_id = $3
        RETURNING *;
      `;
      
      const res = await client.query(updateQuery, [status, orderId, vendorId]);
      
      if (res.rows.length === 0) {
        return { statusCode: 404, headers, body: JSON.stringify('Order not found or access denied') };
      }
      
      return { statusCode: 200, headers, body: JSON.stringify(res.rows[0]) };
    }

    return { statusCode: 405, headers, body: JSON.stringify('Method Not Allowed') };
  } catch (err) {
    console.error('Order error:', err);
    const error = err as Error;
     if (error.message.includes('Forbidden')) {
        return { statusCode: 403, headers, body: JSON.stringify(error.message) };
    }
    if (error.message.includes('not found')) {
        return { statusCode: 404, headers, body: JSON.stringify(error.message) };
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error', message: (err as Error).message }) };
  } finally {
    client.release();
  }
}