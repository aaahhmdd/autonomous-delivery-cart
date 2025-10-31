/**
 * This Lambda handles all API requests for user profiles:
 * - GET /users/me
 * - POST /users/me
 */

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
    */

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

