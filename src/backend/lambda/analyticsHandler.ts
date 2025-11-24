import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getPool } from './dbPool';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'OPTIONS,GET',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
};

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const cognitoUserId = event.requestContext.authorizer?.claims.sub;
    if (!cognitoUserId) return { statusCode: 401, headers, body: JSON.stringify('Unauthorized') };

    // Get Vendor ID
    const userRes = await client.query('SELECT id, role FROM users WHERE cognito_id = $1', [cognitoUserId]);
    if (userRes.rows.length === 0) return { statusCode: 404, headers, body: JSON.stringify('User not found') };
    if (userRes.rows[0].role !== 'vendor') return { statusCode: 403, headers, body: JSON.stringify('Not a vendor') };
    
    const vendorId = userRes.rows[0].id;

    // Get Totals from View
    const query = `
      SELECT COALESCE(SUM(total_revenue), 0) as revenue, COALESCE(SUM(total_orders), 0) as orders
      FROM vendor_daily_sales WHERE vendor_id = $1
    `;
    const res = await client.query(query, [vendorId]);

    return { statusCode: 200, headers, body: JSON.stringify(res.rows[0]) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: (err as Error).message }) };
  } finally {
    client.release();
  }
}