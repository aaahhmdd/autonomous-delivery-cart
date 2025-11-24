

/**
 * This Lambda function handles all API requests related to products.
 * Specifically: GET /vendors/{id}/products
 * Version: Cost-$0 (No NAT, no Secrets Manager)


// --- SDK and Library Imports ---
import { Client } from 'pg';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// --- Environment Variables ---
// Directly use plaintext env vars (passed from CDK)
// **FIXED**: Removed extra '}' bracket
const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD } = process.env;

/**
 * Main entry point for the Lambda function.

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
    console.log('Connected to database successfully');

    const httpMethod = event.httpMethod; // chatgpt fix

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

*/







// sprint 3
/*-

// lambda/productHandler.ts
import { Client } from 'pg';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));
  const pool = getPool();
  const client = await pool.connect();
  try {
    const httpMethod = event.httpMethod;
    if (httpMethod !== 'GET') {
      return { statusCode: 405, body: JSON.stringify({ error: `Unsupported method: ${httpMethod}` }) };
    }
    const vendorId = event.pathParameters?.id;
    if (!vendorId) {
      return { statusCode: 400, body: JSON.stringify('Bad Request: Missing vendorId') };
    }

    const query = `
      SELECT 
        p.id, p.name, p.description, p.sku, p.image_url,
        i.price, i.quantity_in_stock
      FROM products p
      JOIN inventories i ON p.id = i.product_id
      WHERE i.vendor_id = $1;
    `;
    const res = await client.query(query, [vendorId]);
    return { statusCode: 200, body: JSON.stringify(res.rows), headers: { 'Content-Type': 'application/json' } };
  } catch (err) {
    console.error('productHandler error', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error', message: (err as Error).message }) };
  } finally {
    client.release();
  }
}
*/



// sprint 4 - v1

/**
 * This Lambda function handles all API requests related to products.
 * Specifically: GET /vendors/{id}/products
 * Version: Standardized with Connection Pool & CORS
 

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';

// --- HELPER: Standard CORS Headers ---
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // Allow any origin
  'Access-Control-Allow-Methods': 'OPTIONS,GET', // Products are read-only public here
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Idempotency-Key',
};

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const pool = getPool();
  const client = await pool.connect();

  try {
    const httpMethod = event.httpMethod;

    // --- GET /vendors/{id}/products ---
    if (httpMethod === 'GET') {
      const vendorId = event.pathParameters?.id;
      
      if (!vendorId) {
        return { 
          statusCode: 400, 
          headers, 
          body: JSON.stringify('Bad Request: Missing vendorId') 
        };
      }

      const query = `
        SELECT 
          p.id, p.name, p.description, p.sku, p.image_url,
          i.price, i.quantity_in_stock
        FROM products p
        JOIN inventories i ON p.id = i.product_id
        WHERE i.vendor_id = $1;
      `;
      
      const res = await client.query(query, [vendorId]);
      
      return { 
        statusCode: 200, 
        headers, // <--- Crucial for frontend access
        body: JSON.stringify(res.rows) 
      };
    }

    return { 
      statusCode: 405, 
      headers, 
      body: JSON.stringify({ error: `Unsupported method: ${httpMethod}` }) 
    };

  } catch (err) {
    console.error('productHandler error', err);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Internal Server Error', message: (err as Error).message }) 
    };
  } finally {
    // Always release the client back to the pool
    client.release();
  }
}

*/

// sprint 4 - v2


/**
 * This Lambda function handles all public API requests for:
 * 1. Listing Vendors (optionally filtered by Compound)
 * 2. Listing Products for a specific Vendor
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';

// --- HELPER: Standard CORS Headers ---
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // Allow any origin (public read access is fine here)
  'Access-Control-Allow-Methods': 'OPTIONS,GET',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Idempotency-Key',
};

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // Use the shared connection pool
  const pool = getPool();
  const client = await pool.connect();

  try {
    const httpMethod = event.httpMethod;
    const path = event.path;
    const queryParams = event.queryStringParameters;

    // --- 1. GET /vendors (List Vendors) ---
    // Optional Query Param: ?compound=CompoundA
    if (httpMethod === 'GET' && path === '/vendors') {
      const compound = queryParams?.compound;
      
      let query = `SELECT id, name, compound, shop_image_url FROM users WHERE role = 'vendor'`;
      const params: any[] = [];

      // If a compound is provided, filter by it
      if (compound) {
        query += ` AND compound = $1`;
        params.push(compound);
      }
      
      const res = await client.query(query, params);
      return { statusCode: 200, headers, body: JSON.stringify(res.rows) };
    }

    // --- 2. GET /vendors/{id}/products (List Products) ---
    // This is your existing logic, updated with pool/CORS
    if (httpMethod === 'GET' && path.endsWith('/products')) {
      const vendorId = event.pathParameters?.id;
      
      if (!vendorId) {
        return { 
          statusCode: 400, 
          headers, 
          body: JSON.stringify('Bad Request: Missing vendorId') 
        };
      }

      const query = `
        SELECT 
          p.id, p.name, p.description, p.sku, p.image_url,
          i.price, i.quantity_in_stock
        FROM products p
        JOIN inventories i ON p.id = i.product_id
        WHERE i.vendor_id = $1;
      `;
      
      const res = await client.query(query, [vendorId]);
      
      return { statusCode: 200, headers, body: JSON.stringify(res.rows) };
    }

    return { 
      statusCode: 405, 
      headers, 
      body: JSON.stringify({ error: `Unsupported method: ${httpMethod}` }) 
    };

  } catch (err) {
    console.error('productHandler error', err);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: 'Internal Server Error', message: (err as Error).message }) 
    };
  } finally {
    // Always release the client back to the pool
    client.release();
  }
}