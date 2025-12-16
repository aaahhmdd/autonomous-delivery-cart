import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.TELEMETRY_TABLE_NAME || '';

export const handler = async (event: any) => {
  console.log('Telemetry Event:', JSON.stringify(event, null, 2));

  // The event IS the MQTT payload
  const { cart_id, lat, lon, battery, status } = event;

  if (!cart_id) {
    console.error('Missing cart_id');
    return;
  }

  const timestamp = Date.now();

  const command = new PutItemCommand({
    TableName: TABLE_NAME,
    Item: {
      cart_id: { S: cart_id },
      timestamp: { N: timestamp.toString() },
      lat: { N: (lat || 0).toString() },
      lon: { N: (lon || 0).toString() },
      battery: { N: (battery || 0).toString() },
      status: { S: status || 'unknown' },
      // Auto-delete after 24 hours
      ttl: { N: (Math.floor(timestamp / 1000) + 86400).toString() } 
    },
  });

  try {
    await client.send(command);
    console.log(`Saved ${cart_id} telemetry`);
  } catch (err) {
    console.error('DynamoDB Error:', err);
    throw err;
  }
};