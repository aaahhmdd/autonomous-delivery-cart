import pg8000

print("⏳ Attempting to connect to AWS RDS directly over the public internet...")

try:
    # Using pg8000 (Pure Python) to bypass Windows C++ build errors
    # A 5-second timeout will tell us if the DB is still trapped in the private subnet!
    conn = pg8000.connect(
        host="backendstack-deliverydatabase91899285-av2mwcgnntho.c7uskyq2qn55.eu-central-1.rds.amazonaws.com",
        port=5432,
        database="deliverydb",
        user="postgres",
        password="GradProjectPassword123!", 
        timeout=5 
    )
    
    print("✅ SUCCESS! Your database is officially PUBLIC!")
    print("🛠️ Running ALTER TABLE commands to add GPS and PIN columns...")
    
    cur = conn.cursor()
    
    # Update Orders Table
    cur.execute("""
    ALTER TABLE orders 
    ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(10, 6),
    ADD COLUMN IF NOT EXISTS delivery_lon NUMERIC(10, 6),
    ADD COLUMN IF NOT EXISTS unlock_pin VARCHAR(4),
    ADD COLUMN IF NOT EXISTS dispatched_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
    """)
    
    # Update Users Table (to fix the "Compound" missing error)
    cur.execute("""
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS compound VARCHAR(255);
    """)
    
    conn.commit()
    cur.close()
    conn.close()
    
    print("🎉 Database Schema Updated! You are 100% ready for the End-to-End Test!")

except Exception as e:
    print("\n❌ FAILED TO CONNECT! (Timeout)")
    print(f"Error Details: {e}")
    print("⚠️ This means AWS CDK ignored our command and your DB is STILL trapped in the private subnet.")