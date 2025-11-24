// sprint 3

/*

/**
 * This Lambda handles all API requests for user profiles:
 * - GET /users/me
 * - POST /users/me


// **FIX 1: Remove `Client` import, add `getPool` import**
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';

// --- MAIN HANDLER ---
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));

  // **FIX 2: Get the pool and connect a client**
  const pool = getPool();
  const client = await pool.connect();
  console.log('Successfully connected client from pool');

  try {
    // --- 3. Extract Cognito User ID ---
    const cognitoUserId = event.requestContext.authorizer?.claims.sub;
    if (!cognitoUserId) {
      return {
        statusCode: 401,
        body: JSON.stringify('Unauthorized: No user ID in token'),
      };
    }

    let responseBody: string;
    let statusCode = 200;

    // --- 4. Determine HTTP Method ---
    const httpMethod = event.httpMethod;

    /*
      Our main schema for the 'users' table:
      ... (schema comment) ...
    

    if (httpMethod === 'GET') {
      // --- GET /users/me ---
      console.log('Handling GET /users/me for:', cognitoUserId);
      const res = await client.query(
        'SELECT id, name, email, phone_number, role, default_delivery_address, business_address FROM users WHERE cognito_id = $1',
        [cognitoUserId]
      );

      if (res.rows.length === 0) {
        statusCode = 404;
        responseBody = JSON.stringify({ error: 'User profile not found' });
      } else {
        responseBody = JSON.stringify(res.rows[0]);
      }
    } else if (httpMethod === 'POST') {
      // --- POST /users/me ---
      console.log('Handling POST /users/me for:', cognitoUserId);
      const body = JSON.parse(event.body || '{}');
      
      const { name, phone_number, default_delivery_address } = body;
      const email = event.requestContext.authorizer?.claims.email;

      if (!name || !phone_number || !default_delivery_address || !email) {
        return {
          statusCode: 400,
          body: JSON.stringify('Bad Request: Missing required fields or email in token'),
        };
      }
      
      const query = `
        INSERT INTO users (cognito_id, name, email, phone_number, default_delivery_address, role, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6::user_role, $7)
        ON CONFLICT (cognito_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          phone_number = EXCLUDED.phone_number,
          default_delivery_address = EXCLUDED.default_delivery_address
        RETURNING id, name, email, phone_number, role, default_delivery_address;
      `;

      const placeholder_hash = 'COGNITO_USER_NO_PASSWORD';

      const res = await client.query(query, [
        cognitoUserId,
        name,
        email,
        phone_number,
        default_delivery_address,
        'customer',
        placeholder_hash,
      ]);

      statusCode = 201;
      responseBody = JSON.stringify(res.rows[0]);
    } else {
      // --- Unsupported HTTP method ---
      statusCode = 405;
      responseBody = JSON.stringify({
        error: `Unsupported method: ${httpMethod}`,
      });
    }

    return {
      statusCode,
      body: responseBody,
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (err) {
    console.error('Lambda handler failed:', err);
    if ((err as any).code === '23505') {
       return {
        statusCode: 409,
        body: JSON.stringify({
          error: 'Conflict',
          message: 'An account with this email or phone number already exists.',
        }),
      };
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: (err as Error).message,
      }),
    };
  } finally {
    // **FIX 3: Release client back to pool instead of ending it**
    if (client) {
      client.release();
      console.log('Database client released back to pool');
    }
  }
}


*/


// sprint 4

/*
/**
 * This Lambda handles all API requests for user profiles:
 * - GET /users/me
 * - POST /users/me
 

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';

// --- MAIN HANDLER ---
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));

  // **FIX: Use the shared connection pool for performance**
  const pool = getPool();
  const client = await pool.connect();
  console.log('Successfully connected client from pool');

  try {
    // --- 3. Extract Cognito User ID ---
    const cognitoUserId = event.requestContext.authorizer?.claims.sub;
    if (!cognitoUserId) {
      return {
        statusCode: 401,
        body: JSON.stringify('Unauthorized: No user ID in token'),
      };
    }

    let responseBody: string;
    let statusCode = 200;

    // --- 4. Determine HTTP Method ---
    const httpMethod = event.httpMethod;

    if (httpMethod === 'GET') {
      // --- GET /users/me ---
      console.log('Handling GET /users/me for:', cognitoUserId);
      const res = await client.query(
        'SELECT id, name, email, phone_number, role, default_delivery_address, business_address FROM users WHERE cognito_id = $1',
        [cognitoUserId]
      );

      if (res.rows.length === 0) {
        statusCode = 404;
        responseBody = JSON.stringify({ error: 'User profile not found' });
      } else {
        responseBody = JSON.stringify(res.rows[0]);
      }
    } else if (httpMethod === 'POST') {
      // --- POST /users/me ---
      console.log('Handling POST /users/me for:', cognitoUserId);
      const body = JSON.parse(event.body || '{}');
      
      const { name, phone_number, default_delivery_address } = body;
      const email = event.requestContext.authorizer?.claims.email;

      if (!name || !phone_number || !default_delivery_address || !email) {
        return {
          statusCode: 400,
          body: JSON.stringify('Bad Request: Missing required fields or email in token'),
        };
      }
      
      // *** SPRINT 4 DEV TRICK ***
      // If the name contains "Vendor" (case-insensitive), automatically make them a vendor.
      // This allows you to create a vendor account for testing without a Manager Dashboard.
      const role = name.toLowerCase().includes('vendor') ? 'vendor' : 'customer';

      const query = `
        INSERT INTO users (cognito_id, name, email, phone_number, default_delivery_address, role, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6::user_role, $7)
        ON CONFLICT (cognito_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          phone_number = EXCLUDED.phone_number,
          default_delivery_address = EXCLUDED.default_delivery_address
        RETURNING id, name, email, phone_number, role, default_delivery_address;
      `;

      const placeholder_hash = 'COGNITO_USER_NO_PASSWORD';

      const res = await client.query(query, [
        cognitoUserId,
        name,
        email,
        phone_number,
        default_delivery_address,
        role, // <--- Uses the variable logic we added above
        placeholder_hash,
      ]);

      statusCode = 201;
      responseBody = JSON.stringify(res.rows[0]);
    } else {
      // --- Unsupported HTTP method ---
      statusCode = 405;
      responseBody = JSON.stringify({
        error: `Unsupported method: ${httpMethod}`,
      });
    }

    return {
      statusCode,
      body: responseBody,
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (err) {
    console.error('Lambda handler failed:', err);
    // Check for unique constraint violation (e.g., email already exists)
    if ((err as any).code === '23505') {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: 'Conflict',
          message: 'An account with this email or phone number already exists.',
        }),
      };
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: (err as Error).message,
      }),
    };
  } finally {
    // **FIX: Release client back to pool instead of ending it**
    if (client) {
      client.release();
      console.log('Database client released back to pool');
    }
  }
}

*/








// sprint 4 - v1


/*

/**
 * This Lambda handles all API requests for user profiles:
 * - GET /users/me
 * - POST /users/me
 

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';

// --- HELPER: Standard CORS Headers ---
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', // Allow any origin (localhost, amplify, etc.)
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Idempotency-Key',
};

// --- MAIN HANDLER ---
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));

  const pool = getPool();
  const client = await pool.connect();

  try {
    const cognitoUserId = event.requestContext.authorizer?.claims.sub;
    if (!cognitoUserId) {
      return {
        statusCode: 401,
        headers, // Add headers here
        body: JSON.stringify('Unauthorized: No user ID in token'),
      };
    }

    const httpMethod = event.httpMethod;

    if (httpMethod === 'GET') {
      // --- GET /users/me ---
      const res = await client.query(
        'SELECT id, name, email, phone_number, role, default_delivery_address, business_address FROM users WHERE cognito_id = $1',
        [cognitoUserId]
      );

      if (res.rows.length === 0) {
        return {
          statusCode: 404,
          headers, // CRITICAL: Add headers here so frontend can see the 404
          body: JSON.stringify({ error: 'User profile not found' }),
        };
      }
      
      return {
        statusCode: 200,
        headers, // Add headers here
        body: JSON.stringify(res.rows[0]),
      };

    } else if (httpMethod === 'POST') {
      // --- POST /users/me ---
      const body = JSON.parse(event.body || '{}');
      const { name, phone_number, default_delivery_address } = body;
      const email = event.requestContext.authorizer?.claims.email;

      if (!name || !phone_number || !default_delivery_address || !email) {
        return {
          statusCode: 400,
          headers, // Add headers here
          body: JSON.stringify('Bad Request: Missing required fields'),
        };
      }
      
      // *** SPRINT 4 DEV TRICK ***
      const role = name.toLowerCase().includes('vendor') ? 'vendor' : 'customer';
      const placeholder_hash = 'COGNITO_USER_NO_PASSWORD';

      const query = `
        INSERT INTO users (cognito_id, name, email, phone_number, default_delivery_address, role, password_hash)
        VALUES ($1, $2, $3, $4, $5, $6::user_role, $7)
        ON CONFLICT (cognito_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          phone_number = EXCLUDED.phone_number,
          default_delivery_address = EXCLUDED.default_delivery_address
        RETURNING id, name, email, phone_number, role, default_delivery_address;
      `;

      const res = await client.query(query, [
        cognitoUserId,
        name,
        email,
        phone_number,
        default_delivery_address,
        role,
        placeholder_hash,
      ]);

      return {
        statusCode: 201,
        headers, // Add headers here
        body: JSON.stringify(res.rows[0]),
      };
    }

    return {
      statusCode: 405,
      headers, // Add headers here
      body: JSON.stringify({ error: `Unsupported method: ${httpMethod}` }),
    };

  } catch (err) {
    console.error('Lambda handler failed:', err);
    const statusCode = (err as any).code === '23505' ? 409 : 500;
    return {
      statusCode,
      headers, // Add headers here
      body: JSON.stringify({
        error: statusCode === 409 ? 'Conflict' : 'Internal Server Error',
        message: (err as Error).message,
      }),
    };
  } finally {
    if (client) {
      client.release();
    }
  }
}

*/


// sprint 4 - v2 


/**
 * This Lambda handles all API requests for user profiles:
 * - GET /users/me
 * - POST /users/me
 * * Updates for Sprint 4:
 * - Saves 'compound' and 'shop_image_url' to DB.
 * - Uses getPool() and CORS headers.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';

// --- HELPER: Standard CORS Headers ---
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*', 
  'Access-Control-Allow-Methods': 'OPTIONS,POST,GET,PUT,DELETE',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,Idempotency-Key',
};

// --- MAIN HANDLER ---
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));

  const pool = getPool();
  const client = await pool.connect();

  try {
    const cognitoUserId = event.requestContext.authorizer?.claims.sub;
    if (!cognitoUserId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify('Unauthorized: No user ID in token'),
      };
    }

    const httpMethod = event.httpMethod;

    if (httpMethod === 'GET') {
      // --- GET /users/me ---
      // UPDATE: Added 'compound' and 'shop_image_url' to SELECT
      const res = await client.query(
        'SELECT id, name, email, phone_number, role, default_delivery_address, business_address, compound, shop_image_url FROM users WHERE cognito_id = $1',
        [cognitoUserId]
      );

      if (res.rows.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'User profile not found' }),
        };
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(res.rows[0]),
      };

    } else if (httpMethod === 'POST') {
      // --- POST /users/me ---
      const body = JSON.parse(event.body || '{}');
      
      // UPDATE: Extract 'compound' and 'shop_image_url' from body
      const { name, phone_number, default_delivery_address, compound, shop_image_url } = body;
      const email = event.requestContext.authorizer?.claims.email;

      if (!name || !phone_number || !email) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify('Bad Request: Missing required fields (name, phone_number)'),
        };
      }
      
      // Logic: If name contains "Vendor", role = 'vendor'. Else 'customer'.
      const role = name.toLowerCase().includes('vendor') ? 'vendor' : 'customer';
      const placeholder_hash = 'COGNITO_USER_NO_PASSWORD';

      // UPDATE: Insert new columns into DB
      const query = `
        INSERT INTO users (cognito_id, name, email, phone_number, default_delivery_address, role, password_hash, compound, shop_image_url)
        VALUES ($1, $2, $3, $4, $5, $6::user_role, $7, $8, $9)
        ON CONFLICT (cognito_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          phone_number = EXCLUDED.phone_number,
          default_delivery_address = EXCLUDED.default_delivery_address,
          compound = EXCLUDED.compound,
          shop_image_url = EXCLUDED.shop_image_url
        RETURNING id, name, email, phone_number, role, default_delivery_address, compound;
      `;

      const res = await client.query(query, [
        cognitoUserId,
        name,
        email,
        phone_number,
        default_delivery_address,
        role,
        placeholder_hash,
        compound || null,       // Pass compound (can be null for customers)
        shop_image_url || null  // Pass logo URL
      ]);

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(res.rows[0]),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: `Unsupported method: ${httpMethod}` }),
    };

  } catch (err) {
    console.error('Lambda handler failed:', err);
    const statusCode = (err as any).code === '23505' ? 409 : 500;
    return {
      statusCode,
      headers,
      body: JSON.stringify({
        error: statusCode === 409 ? 'Conflict' : 'Internal Server Error',
        message: (err as Error).message,
      }),
    };
  } finally {
    if (client) {
      client.release();
    }
  }
}