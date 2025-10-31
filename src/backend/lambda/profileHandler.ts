/**
 * This Lambda handles all API requests for user profiles:
 * - GET /users/me
 * - POST /users/me
 *
 * This version uses a plaintext DB password (DB_PASSWORD) from environment variables.
 * This avoids Secrets Manager to stay fully cost-free (no $0.40/month).
 */

import { Client } from 'pg';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

// --- Environment Variables ---
const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD } = process.env;

// --- MAIN HANDLER ---
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  console.log('Event:', JSON.stringify(event, null, 2));

  let client: Client | undefined;

  try {
    // --- 1. Validate environment variables ---
    if (!DB_HOST || !DB_NAME || !DB_USER || !DB_PASSWORD) {
      throw new Error('Missing DB configuration environment variables');
    }

    // --- 2. Connect to the PostgreSQL Database ---
    client = new Client({
      host: DB_HOST,
      port: 5432,
      user: DB_USER, // Use the env variable for consistency
      password: DB_PASSWORD,
      database: DB_NAME,
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();
    console.log('Successfully connected to the database');

    // --- 3. Extract Cognito User ID ---
    // **FIXED**: Changed event type to v1. No '.jwt' is needed.
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
    // **FIXED**: v1 event uses 'httpMethod'
    const httpMethod = event.httpMethod;

    /*
      Our main schema for the 'users' table:

      CREATE TABLE users (
         id SERIAL PRIMARY KEY,
         cognito_id VARCHAR(255) UNIQUE, -- Added this column
         name VARCHAR(255) NOT NULL,
         email VARCHAR(255) UNIQUE NOT NULL,
         phone_number VARCHAR(20) UNIQUE,
         password_hash VARCHAR(255) NOT NULL,
         role user_role NOT NULL, -- This is an ENUM
         default_delivery_address TEXT,
         business_address TEXT,
         created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    */

    if (httpMethod === 'GET') {
      // --- GET /users/me ---
      console.log('Handling GET /users/me for:', cognitoUserId);
      const res = await client.query(
        // Querying by cognito_id, which we added to the schema
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
      // This is for a new 'customer' to create their profile after signing up.
      console.log('Handling POST /users/me for:', cognitoUserId);
      const body = JSON.parse(event.body || '{}');
      
      // Get Cognito attributes (passed by mobile app)
      
      // Get profile details from body
      const { name, phone_number, default_delivery_address } = body;

      // **FIXED**: v1 event type - get email from claims (REMOVED duplicate line 99)
      const email = event.requestContext.authorizer?.claims.email;

      if (!name || !phone_number || !default_delivery_address || !email) {
        return {
          statusCode: 400,
          body: JSON.stringify('Bad Request: Missing required fields or email in token'),
        };
      }
      
      // **FIXED QUERY**
      // 1. We now insert all required fields from the schema (email, password_hash)
      // 2. We cast the 'customer' string to the 'user_role' ENUM type
      // **FIXED**: Added 'password_hash' column and '$7' placeholder
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

      // **FIXED**: Defined 'placeholder_hash'
      const placeholder_hash = 'COGNITO_USER_NO_PASSWORD';

      const res = await client.query(query, [
        cognitoUserId,
        name,
        email, // Add email from token
        phone_number,
        default_delivery_address,
        'customer', // This will be cast to user_role
        placeholder_hash,
      ]);

      statusCode = 201; // 201 Created for a successful POST
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
        statusCode: 409, // Conflict
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
    if (client) {
      await client.end();
      console.log('Database connection closed');
    }
  }
}


