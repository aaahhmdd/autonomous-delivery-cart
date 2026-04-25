// v1


/*
// lambda/dbPool.ts
import { Pool } from 'pg';

let pool: Pool | undefined;

/**
 * Creates and returns a singleton PostgreSQL connection pool.
 * Subsequent calls will return the existing pool.
 * This is crucial for performance in AWS Lambda.
 
export function getPool() {
    if (!pool) {
        console.log('No existing pool found. Initializing new pg Pool...');
            // Check for required environment variables
            const requiredEnv = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
            for (const env of requiredEnv) {
                if (!process.env[env]) {
                    console.error(`Missing required environment variable: ${env}`);
                    throw new Error(`Database configuration is incomplete. Missing: ${env}`);
                }
            }

    pool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      max: 6, // Max concurrent connections
      idleTimeoutMillis: 30000, // Close idle connections after 30s
      connectionTimeoutMillis: 5000, // Fail to connect after 5s
      ssl: {
        // Required for AWS RDS
        rejectUnauthorized: false,
      },
    });

    // Optional: Add error listener
    pool.on('error', (err, client) => {
      console.error('Unexpected error on idle pg client', err);
    });

    console.log('New pg Pool initialized successfully.');
  }
  return pool;
}

*/

// v2


import { Pool } from 'pg';

let pool: Pool | undefined;

/**
 * Creates and returns a singleton PostgreSQL connection pool.
 * Subsequent calls will return the existing pool.
 * This is crucial for performance in AWS Lambda.
 */
export function getPool() {
    if (!pool) {
        console.log('No existing pool found. Initializing new pg Pool...');
        
        // Check for required environment variables
        const requiredEnv = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
        for (const env of requiredEnv) {
            if (!process.env[env]) {
                console.error(`Missing required environment variable: ${env}`);
                throw new Error(`Database configuration is incomplete. Missing: ${env}`);
            }
        }

        pool = new Pool({
            host: process.env.DB_HOST,
            port: Number(process.env.DB_PORT),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            max: 6, // Max concurrent connections
            idleTimeoutMillis: 30000, // Close idle connections after 30s
            connectionTimeoutMillis: 5000, // Fail to connect after 5s
            // 🔐 SSL FIX: Required by AWS RDS for public internet connections
            ssl: {
                rejectUnauthorized: false,
            },
        });

        // Optional: Add error listener
        pool.on('error', (err, client) => {
            console.error('Unexpected error on idle pg client', err);
        });

        console.log('New pg Pool initialized successfully with SSL enabled.');
    }
    return pool;
}