
/*
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';
import { PoolClient } from 'pg';

/**
 * Gets the internal vendor ID and role from a Cognito User ID.
 * Throws an error if the user is not a vendor.
 
async function getVendorId(client: PoolClient, cognitoUserId: string): Promise<number> {
  const userRes = await client.query('SELECT id, role FROM users WHERE cognito_id = $1', [cognitoUserId]);
  if (userRes.rows.length === 0) {
    throw new Error('User profile not found.');
  }
  const user = userRes.rows[0];
  if (user.role !== 'vendor') {
    throw new Error('Forbidden: User is not a vendor.');
  }
  return Number(user.id);
}

/**
 * Handles all "vendor-as-user" inventory management.
 * - GET /users/me/products
 * - POST /users/me/products
 * - PUT /users/me/products/{productId}
 
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));
  const pool = getPool();
  const client = await pool.connect();

  try {
    const cognitoUserId = event.requestContext.authorizer?.claims.sub;
    if (!cognitoUserId) {
      return { statusCode: 401, body: JSON.stringify('Unauthorized') };
    }

    const httpMethod = event.httpMethod;
    const path = event.path;
    const vendorId = await getVendorId(client, cognitoUserId);

    // --- GET /users/me/products ---
    // Get all products for the logged-in vendor
    if (httpMethod === 'GET' && path.endsWith('/products')) {
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
    }

    // --- POST /users/me/products ---
    // Create a new product and add it to inventory
    if (httpMethod === 'POST' && path.endsWith('/products')) {
      const body = JSON.parse(event.body || '{}');
      const { name, description, sku, image_url, price, quantity_in_stock } = body;

      if (!name || !sku || price === undefined || quantity_in_stock === undefined) {
        return { statusCode: 400, body: JSON.stringify('Bad Request: Missing required fields (name, sku, price, quantity_in_stock)') };
      }

      let newProductId: number;
      await client.query('BEGIN');
      try {
        // 1. Create product
        const productQuery = `
          INSERT INTO products (name, description, sku, image_url)
          VALUES ($1, $2, $3, $4)
          RETURNING id;
        `;
        const productRes = await client.query(productQuery, [name, description, sku, image_url || null]);
        newProductId = productRes.rows[0].id;

        // 2. Add to inventory
        const inventoryQuery = `
          INSERT INTO inventories (vendor_id, product_id, price, quantity_in_stock)
          VALUES ($1, $2, $3, $4);
        `;
        await client.query(inventoryQuery, [vendorId, newProductId, price, quantity_in_stock]);
        
        await client.query('COMMIT');
        
        return { statusCode: 201, body: JSON.stringify({ productId: newProductId, ...body }) };

      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      }
    }
    
    // --- PUT /users/me/products/{productId} ---
    // Update an existing product and its inventory
    if (httpMethod === 'PUT' && event.pathParameters?.productId) {
      const productId = event.pathParameters.productId;
      const body = JSON.parse(event.body || '{}');
      // Only allow updating these fields
      const { name, description, sku, image_url, price, quantity_in_stock } = body;

      if (!name && !description && !sku && !image_url && price === undefined && quantity_in_stock === undefined) {
         return { statusCode: 400, body: JSON.stringify('Bad Request: No updateable fields provided.') };
      }

      await client.query('BEGIN');
      try {
        // 1. Update products table
        if (name || description || sku || image_url) {
          const productQuery = `
            UPDATE products SET
              name = COALESCE($1, name),
              description = COALESCE($2, description),
              sku = COALESCE($3, sku),
              image_url = COALESCE($4, image_url)
            WHERE id = $5;
          `;
          await client.query(productQuery, [name, description, sku, image_url, productId]);
        }
        
        // 2. Update inventories table
        if (price !== undefined || quantity_in_stock !== undefined) {
           const inventoryQuery = `
            UPDATE inventories SET
              price = COALESCE($1, price),
              quantity_in_stock = COALESCE($2, quantity_in_stock)
            WHERE product_id = $3 AND vendor_id = $4;
          `;
          const res = await client.query(inventoryQuery, [price, quantity_in_stock, productId, vendorId]);
          
          if (res.rowCount === 0) {
            throw new Error('Product not found or access denied.');
          }
        }
        
        await client.query('COMMIT');
        return { statusCode: 200, body: JSON.stringify({ message: 'Product updated successfully', ...body }) };

      } catch (txErr) {
        await client.query('ROLLBACK');
        if ((txErr as Error).message.includes('access denied')) {
            return { statusCode: 404, body: JSON.stringify('Product not found or access denied') };
        }
        throw txErr;
      }
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
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal Server Error', message: error.message }) };
  } finally {
    if (client) {
      client.release();
    }
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

/**
 * Gets the internal vendor ID and role from a Cognito User ID.
 * Throws an error if the user is not a vendor.
 
async function getVendorId(client: PoolClient, cognitoUserId: string): Promise<number> {
  const userRes = await client.query('SELECT id, role FROM users WHERE cognito_id = $1', [cognitoUserId]);
  if (userRes.rows.length === 0) {
    throw new Error('User profile not found.');
  }
  const user = userRes.rows[0];
  if (user.role !== 'vendor') {
    throw new Error('Forbidden: User is not a vendor.');
  }
  return Number(user.id);
}

/**
 * Handles all "vendor-as-user" inventory management.
 * - GET /users/me/products
 * - POST /users/me/products
 * - PUT /users/me/products/{productId}
 
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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
    
    // This helper will throw if user is not a vendor, which is caught below
    const vendorId = await getVendorId(client, cognitoUserId);

    // --- GET /users/me/products ---
    // Get all products for the logged-in vendor
    if (httpMethod === 'GET' && path.endsWith('/products')) {
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

    // --- POST /users/me/products ---
    // Create a new product and add it to inventory
    if (httpMethod === 'POST' && path.endsWith('/products')) {
      const body = JSON.parse(event.body || '{}');
      const { name, description, sku, image_url, price, quantity_in_stock } = body;

      if (!name || !sku || price === undefined || quantity_in_stock === undefined) {
        return { statusCode: 400, headers, body: JSON.stringify('Bad Request: Missing required fields (name, sku, price, quantity_in_stock)') };
      }

      let newProductId: number;
      await client.query('BEGIN');
      try {
        // 1. Create product
        const productQuery = `
          INSERT INTO products (name, description, sku, image_url)
          VALUES ($1, $2, $3, $4)
          RETURNING id;
        `;
        const productRes = await client.query(productQuery, [name, description, sku, image_url || null]);
        newProductId = productRes.rows[0].id;

        // 2. Add to inventory
        const inventoryQuery = `
          INSERT INTO inventories (vendor_id, product_id, price, quantity_in_stock)
          VALUES ($1, $2, $3, $4);
        `;
        await client.query(inventoryQuery, [vendorId, newProductId, price, quantity_in_stock]);
        
        await client.query('COMMIT');
        
        return { statusCode: 201, headers, body: JSON.stringify({ productId: newProductId, ...body }) };

      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      }
    }
    
    // --- PUT /users/me/products/{productId} ---
    // Update an existing product and its inventory
    if (httpMethod === 'PUT' && event.pathParameters?.productId) {
      const productId = event.pathParameters.productId;
      const body = JSON.parse(event.body || '{}');
      // Only allow updating these fields
      const { name, description, sku, image_url, price, quantity_in_stock } = body;

      if (!name && !description && !sku && !image_url && price === undefined && quantity_in_stock === undefined) {
         return { statusCode: 400, headers, body: JSON.stringify('Bad Request: No updateable fields provided.') };
      }

      await client.query('BEGIN');
      try {
        // 1. Update products table
        if (name || description || sku || image_url) {
          const productQuery = `
            UPDATE products SET
              name = COALESCE($1, name),
              description = COALESCE($2, description),
              sku = COALESCE($3, sku),
              image_url = COALESCE($4, image_url)
            WHERE id = $5;
          `;
          await client.query(productQuery, [name, description, sku, image_url, productId]);
        }
        
        // 2. Update inventories table
        if (price !== undefined || quantity_in_stock !== undefined) {
           const inventoryQuery = `
            UPDATE inventories SET
              price = COALESCE($1, price),
              quantity_in_stock = COALESCE($2, quantity_in_stock)
            WHERE product_id = $3 AND vendor_id = $4;
          `;
          const res = await client.query(inventoryQuery, [price, quantity_in_stock, productId, vendorId]);
          
          if (res.rowCount === 0) {
            throw new Error('Product not found or access denied.');
          }
        }
        
        await client.query('COMMIT');
        return { statusCode: 200, headers, body: JSON.stringify({ message: 'Product updated successfully', ...body }) };

      } catch (txErr) {
        await client.query('ROLLBACK');
        if ((txErr as Error).message.includes('access denied')) {
            return { statusCode: 404, headers, body: JSON.stringify('Product not found or access denied') };
        }
        throw txErr;
      }
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
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal Server Error', message: error.message }) };
  } finally {
    if (client) {
      client.release();
    }
  }
}

*/

// sprint 4 - v1 
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';
import { PoolClient } from 'pg';

// --- HELPER: Standard CORS Headers ---
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Idempotency-Key',
};

async function getVendorId(client: PoolClient, cognitoUserId: string): Promise<number> {
  const userRes = await client.query('SELECT id, role FROM users WHERE cognito_id = $1', [cognitoUserId]);
  if (userRes.rows.length === 0) throw new Error('User profile not found.');
  const user = userRes.rows[0];
  if (user.role !== 'vendor') throw new Error('Forbidden: User is not a vendor.');
  return Number(user.id);
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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
    const vendorId = await getVendorId(client, cognitoUserId);

    // --- GET /users/me/products ---
    if (httpMethod === 'GET' && path.endsWith('/products')) {
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

    // --- POST /users/me/products ---
    if (httpMethod === 'POST' && path.endsWith('/products')) {
      const body = JSON.parse(event.body || '{}');
      const { name, description, sku, image_url, price, quantity_in_stock } = body;

      if (!name || !sku || price === undefined || quantity_in_stock === undefined) {
        return { statusCode: 400, headers, body: JSON.stringify('Bad Request: Missing required fields') };
      }

      // Validate types
      const numPrice = parseFloat(price);
      const numStock = parseInt(quantity_in_stock);

      let newProductId: number;
      await client.query('BEGIN');
      try {
        const productQuery = `
          INSERT INTO products (name, description, sku, image_url)
          VALUES ($1, $2, $3, $4)
          RETURNING id;
        `;
        // FIX: Use '|| null' to handle undefined values safely
        const productRes = await client.query(productQuery, [
            name, 
            description || null, 
            sku, 
            image_url || null
        ]);
        newProductId = productRes.rows[0].id;

        const inventoryQuery = `
          INSERT INTO inventories (vendor_id, product_id, price, quantity_in_stock)
          VALUES ($1, $2, $3, $4);
        `;
        await client.query(inventoryQuery, [vendorId, newProductId, numPrice, numStock]);
        
        await client.query('COMMIT');
        return { statusCode: 201, headers, body: JSON.stringify({ productId: newProductId, ...body }) };

      } catch (txErr) {
        await client.query('ROLLBACK');
        console.error('DB Transaction Error:', txErr);
        throw txErr;
      }
    }
    
    // --- PUT /users/me/products/{productId} ---
    if (httpMethod === 'PUT' && event.pathParameters?.productId) {
      const productId = event.pathParameters.productId;
      const body = JSON.parse(event.body || '{}');
      const { name, description, sku, image_url, price, quantity_in_stock } = body;

      await client.query('BEGIN');
      try {
        if (name || description || sku || image_url) {
          const productQuery = `
            UPDATE products SET
              name = COALESCE($1, name),
              description = COALESCE($2, description),
              sku = COALESCE($3, sku),
              image_url = COALESCE($4, image_url)
            WHERE id = $5;
          `;
          await client.query(productQuery, [name, description || null, sku, image_url || null, productId]);
        }
        
        if (price !== undefined || quantity_in_stock !== undefined) {
           const inventoryQuery = `
            UPDATE inventories SET
              price = COALESCE($1, price),
              quantity_in_stock = COALESCE($2, quantity_in_stock)
            WHERE product_id = $3 AND vendor_id = $4;
          `;
          // Ensure types here too
          const p = price !== undefined ? parseFloat(price) : null;
          const q = quantity_in_stock !== undefined ? parseInt(quantity_in_stock) : null;

          const res = await client.query(inventoryQuery, [p, q, productId, vendorId]);
          if (res.rowCount === 0) throw new Error('Product not found or access denied.');
        }
        
        await client.query('COMMIT');
        return { statusCode: 200, headers, body: JSON.stringify({ message: 'Updated successfully' }) };

      } catch (txErr) {
        await client.query('ROLLBACK');
        if ((txErr as Error).message.includes('access denied')) {
            return { statusCode: 404, headers, body: JSON.stringify('Product not found or access denied') };
        }
        throw txErr;
      }
    }

    return { statusCode: 405, headers, body: JSON.stringify('Method Not Allowed') };

  } catch (err) {
    console.error('Lambda handler error:', err);
    const e = err as Error;
    const status = e.message.includes('Forbidden') ? 403 : e.message.includes('not found') ? 404 : 500;
    // Return the actual error message in the body for debugging
    return { statusCode: status, headers, body: JSON.stringify({ error: e.message }) };
  } finally {
    if (client) {
      client.release();
    }
  }
}