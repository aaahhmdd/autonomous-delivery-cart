'''

import streamlit as st
import boto3
import pandas as pd
import psycopg2
import requests  # NEW: Required for sending API commands to the cart
from botocore.exceptions import ClientError
import config # Ensure you have your config.py with RDS and Cognito details

st.set_page_config(page_title="CARTA Admin Dashboard", page_icon="📊", layout="wide")

# --- AUTH FUNCTIONS (Cognito) ---
def login_cognito(username, password):
    client = boto3.client('cognito-idp', region_name=config.COGNITO_REGION)
    try:
        auth = client.initiate_auth(
            ClientId=config.COGNITO_CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={'USERNAME': username, 'PASSWORD': password}
        )
        return auth['AuthenticationResult']['IdToken'], None
    except ClientError as e:
        return None, e.response['Error']['Message']

# --- DATABASE CONNECTION (Read-Only Analytics) ---
# For internal admin tools, direct DB read is the fastest way to generate heavy charts
@st.cache_resource(ttl=300) # Reconnect every 5 mins automatically
def init_db_connection():
    try:
        return psycopg2.connect(
            host=config.DB_HOST,
            port=config.DB_PORT,
            dbname=config.DB_NAME,
            user=config.DB_USER,
            password=config.DB_PASSWORD,
            connect_timeout=5 # FIX: Stop trying after 5 seconds!
        )
    except Exception as e:
        st.error(f"❌ Database Connection Failed: {e}")
        st.info("Check your AWS SSM Port Forwarding terminal. Is the tunnel open and waiting for connections on port 5432?")
        st.stop()

def fetch_data(query):
    conn = init_db_connection()
    return pd.read_sql_query(query, conn)

# --- STATE MANAGEMENT ---
if 'admin_token' not in st.session_state:
    st.session_state['admin_token'] = None

# === LOGIN PAGE ===
if not st.session_state['admin_token']:
    st.title("📊 CARTA System Administration")
    st.subheader("Manager Secure Login")
    
    with st.form("admin_login"):
        email = st.text_input("Admin Email")
        password = st.text_input("Password", type="password")
        submit = st.form_submit_button("Access Dashboard")
        
        if submit:
            token, error = login_cognito(email, password)
            if token:
                # In a production app, we would verify the Cognito group is 'Admin'
                st.session_state['admin_token'] = token
                st.success("Access Granted.")
                st.rerun()
            else:
                st.error(f"Access Denied: {error}")

# === DASHBOARD PAGE ===
else:
    st.sidebar.title("👨‍💻 Admin Panel")
    if st.sidebar.button("Logout"):
        st.session_state['admin_token'] = None
        st.rerun()
        
    st.title("CARTA Global Analytics Dashboard 🌍")
    st.markdown("Real-time monitoring of the autonomous delivery ecosystem.")
    
    # Add a refresh button
    if st.button("🔄 Refresh Data"):
        st.cache_data.clear()
        
    # --- 1. KPI METRICS (High Level) ---
    st.header("System KPIs")
    
    # Query total metrics
    kpi_df = fetch_data("SELECT COUNT(id) as total_orders, SUM(total_amount) as total_revenue FROM orders WHERE status = 'delivered'")
    total_users_df = fetch_data("SELECT COUNT(id) as users FROM users WHERE role = 'customer'")
    total_vendors_df = fetch_data("SELECT COUNT(id) as vendors FROM users WHERE role = 'vendor'")
    
    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Total Delivered Orders", f"{kpi_df['total_orders'][0] or 0}")
    m2.metric("Total Revenue", f"${kpi_df['total_revenue'][0] or 0.00:,.2f}")
    m3.metric("Registered Customers", f"{total_users_df['users'][0]}")
    m4.metric("Active Vendors", f"{total_vendors_df['vendors'][0]}")
    
    st.divider()

    # --- 2. CHARTS & GRAPHS ---
    c1, c2 = st.columns(2)
    
    with c1:
        st.subheader("📈 Orders Per Day (Last 7 Days)")
        # SQL to group orders by date
        daily_orders_query = """
            SELECT DATE(created_at) as order_date, COUNT(id) as order_count 
            FROM orders 
            GROUP BY DATE(created_at) 
            ORDER BY order_date DESC 
            LIMIT 7
        """
        daily_df = fetch_data(daily_orders_query)
        if not daily_df.empty:
            daily_df['order_date'] = pd.to_datetime(daily_df['order_date'])
            daily_df.set_index('order_date', inplace=True)
            st.bar_chart(daily_df['order_count'])
        else:
            st.info("No order data available yet.")

    with c2:
        st.subheader("💰 Revenue by Vendor (Top 5)")
        vendor_revenue_query = """
            SELECT u.name as vendor_name, SUM(o.total_amount) as revenue 
            FROM orders o
            JOIN users u ON o.vendor_id = u.id
            WHERE o.status = 'delivered'
            GROUP BY u.name
            ORDER BY revenue DESC
            LIMIT 5
        """
        revenue_df = fetch_data(vendor_revenue_query)
        if not revenue_df.empty:
            revenue_df.set_index('vendor_name', inplace=True)
            st.bar_chart(revenue_df['revenue'])
        else:
            st.info("No revenue data available yet.")
            
    st.divider()
    
    # --- 3. LIVE FLEET STATUS ---
    st.header("🤖 Active Fleet Status")
    st.markdown("Currently tracking active orders in the dispatch pipeline.")
    
    active_orders_query = """
        SELECT o.id as order_id, u.name as vendor, o.status, o.delivery_location, o.total_amount, o.updated_at
        FROM orders o
        JOIN users u ON o.vendor_id = u.id
        WHERE o.status IN ('pending', 'preparing', 'out_for_delivery')
        ORDER BY o.updated_at DESC
    """
    active_df = fetch_data(active_orders_query)
    
    if not active_df.empty:
        # Display as a clean, interactive dataframe
        st.dataframe(active_df, use_container_width=True, hide_index=True)
    else:
        st.success("All clear! No pending or active deliveries right now.")

    st.divider()
    
    # ==========================================
    # SPRINT 8: COMMAND & CONTROL PANEL
    # ==========================================
    st.header("🎮 Remote Command & Control")
    st.markdown("Override autonomous systems and send direct hardware commands to the fleet.")
    
    cmd_col1, cmd_col2 = st.columns(2)
    
    with cmd_col1:
        st.subheader("Target Cart")
        # In a real app, this would be a dropdown of active carts from DB
        target_cart = st.text_input("Cart ID", value="cart_001")
        
    with cmd_col2:
        st.subheader("Hardware Actions")
        if st.button("🔓 Unlock Cart Doors", type="primary"):
            # Call our new API endpoint!
            headers = {
                'Authorization': st.session_state['admin_token'],
                'Content-Type': 'application/json'
            }
            payload = {"action": "unlock"}
            
            try:
                res = requests.post(f"{config.API_BASE_URL}/carts/{target_cart}/command", json=payload, headers=headers)
                if res.status_code == 200:
                    st.toast('Command sent successfully!', icon='✅')
                    st.success(f"Unlock command dispatched to {target_cart} via AWS IoT Core.")
                else:
                    st.error(f"Failed to send command: {res.text}")
            except Exception as e:
                st.error(f"API Connection Error: {e}")

        if st.button("🛑 EMERGENCY STOP", type="secondary"):
            # Call our new API endpoint with emergency action!
            headers = {
                'Authorization': st.session_state['admin_token'],
                'Content-Type': 'application/json'
            }
            payload = {"action": "emergency_stop"}
            try:
                res = requests.post(f"{config.API_BASE_URL}/carts/{target_cart}/command", json=payload, headers=headers)
                if res.status_code == 200:
                    st.error(f"EMERGENCY STOP dispatched to {target_cart}!")
                else:
                    st.error(f"Failed to send command: {res.text}")
            except Exception as e:
                st.error(f"API Connection Error: {e}")

                '''


import streamlit as st
import boto3
import pandas as pd
import psycopg2
import requests
from botocore.exceptions import ClientError
import config # Ensure you have your config.py with RDS and Cognito details

# --- PAGE CONFIGURATION (Must be first) ---
st.set_page_config(page_title="CARTA Admin Dashboard", page_icon="📊", layout="wide", initial_sidebar_state="expanded")

# --- AUTH FUNCTIONS (Cognito) ---
def login_cognito(username, password):
    client = boto3.client('cognito-idp', region_name=config.COGNITO_REGION)
    try:
        auth = client.initiate_auth(
            ClientId=config.COGNITO_CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={'USERNAME': username, 'PASSWORD': password}
        )
        return auth['AuthenticationResult']['IdToken'], None
    except ClientError as e:
        return None, e.response['Error']['Message']

# --- DATABASE CONNECTION (Read-Only Analytics) ---
@st.cache_resource(ttl=300) # Reconnect every 5 mins automatically
def init_db_connection():
    try:
        return psycopg2.connect(
            host=config.DB_HOST,
            port=config.DB_PORT,
            dbname=config.DB_NAME,
            user=config.DB_USER,
            password=config.DB_PASSWORD,
            connect_timeout=5
        )
    except Exception as e:
        st.error(f"❌ Database Connection Failed: {e}")
        st.info("Check your AWS SSM Port Forwarding terminal or verify the DB_HOST in config.py.")
        st.stop()

def fetch_data(query):
    conn = init_db_connection()
    return pd.read_sql_query(query, conn)

# --- NEW: Fetch Cart Location API ---
def fetch_cart_location(cart_id):
    if not st.session_state.get('admin_token'): return None
    headers = {
        'Authorization': st.session_state['admin_token'],
        'Content-Type': 'application/json'
    }
    try:
        res = requests.get(f"{config.API_BASE_URL}/carts/{cart_id}/location", headers=headers)
        if res.status_code == 200: 
            return res.json()
    except Exception:
        pass
    return None

# --- STATE MANAGEMENT ---
if 'admin_token' not in st.session_state:
    st.session_state['admin_token'] = None

# ==========================================
# === LOGIN PAGE ===
# ==========================================
if not st.session_state['admin_token']:
    # Center the login box using columns
    _, col2, _ = st.columns([1, 1.5, 1])
    
    with col2:
        st.image("https://img.icons8.com/color/96/000000/delivery-scooter.png", width=80)
        st.title("CARTA Admin HQ")
        st.markdown("### 🔐 Secure Manager Login")
        
        with st.form("admin_login"):
            email = st.text_input("Admin Email", placeholder="admin@carta.com")
            password = st.text_input("Password", type="password", placeholder="••••••••")
            submit = st.form_submit_button("Access Global Dashboard", use_container_width=True)
            
            if submit:
                with st.spinner("Authenticating with AWS Cognito..."):
                    token, error = login_cognito(email, password)
                    if token:
                        st.session_state['admin_token'] = token
                        st.success("Access Granted. Initializing Secure Link...")
                        st.rerun()
                    else:
                        st.error(f"Access Denied: {error}")

# ==========================================
# === DASHBOARD PAGE ===
# ==========================================
else:
    # --- SIDEBAR ---
    with st.sidebar:
        st.image("https://img.icons8.com/color/96/000000/delivery-scooter.png", width=60)
        st.title("Admin Panel")
        st.markdown("Logged in securely via AWS Cognito.")
        st.divider()
        st.markdown("### ⚙️ Quick Actions")
        if st.button("🔄 Force Refresh Data", use_container_width=True):
            st.cache_data.clear()
            st.rerun()
        if st.button("🚪 Logout", type="secondary", use_container_width=True):
            st.session_state['admin_token'] = None
            st.rerun()
        
    # --- MAIN HEADER ---
    st.title("🌍 CARTA Global Command Center")
    st.markdown("Real-time telemetry, analytics, and control for the autonomous delivery ecosystem.")
    st.divider()
    
    # --- 1. KPI METRICS (High Level) ---
    st.subheader("📊 System Health & KPIs")
    
    try:
        kpi_df = fetch_data("SELECT COUNT(id) as total_orders, SUM(total_amount) as total_revenue FROM orders WHERE status = 'delivered'")
        total_users_df = fetch_data("SELECT COUNT(id) as users FROM users WHERE role = 'customer'")
        total_vendors_df = fetch_data("SELECT COUNT(id) as vendors FROM users WHERE role = 'vendor'")
        
        m1, m2, m3, m4 = st.columns(4)
        m1.metric("📦 Total Delivered", f"{kpi_df['total_orders'][0] or 0}")
        m2.metric("💵 Total Revenue", f"${kpi_df['total_revenue'][0] or 0.00:,.2f}")
        m3.metric("👥 Customers", f"{total_users_df['users'][0]}")
        m4.metric("🏪 Vendors", f"{total_vendors_df['vendors'][0]}")
    except Exception as e:
        st.warning("Awaiting database synchronization for KPIs...")
    
    st.divider()

    # --- 2. CHARTS & GRAPHS ---
    c1, c2 = st.columns(2)
    
    with c1:
        st.subheader("📈 Orders Per Day (Last 7 Days)")
        try:
            daily_orders_query = """
                SELECT DATE(created_at) as order_date, COUNT(id) as order_count 
                FROM orders 
                GROUP BY DATE(created_at) 
                ORDER BY order_date DESC 
                LIMIT 7
            """
            daily_df = fetch_data(daily_orders_query)
            if not daily_df.empty:
                daily_df['order_date'] = pd.to_datetime(daily_df['order_date'])
                daily_df.set_index('order_date', inplace=True)
                st.bar_chart(daily_df['order_count'], color="#4CAF50") # Nice green color
            else:
                st.info("No order data available yet.")
        except Exception:
            st.info("No order data available yet.")

    with c2:
        st.subheader("💰 Revenue by Vendor (Top 5)")
        try:
            vendor_revenue_query = """
                SELECT u.name as vendor_name, SUM(o.total_amount) as revenue 
                FROM orders o
                JOIN users u ON o.vendor_id = u.id
                WHERE o.status = 'delivered'
                GROUP BY u.name
                ORDER BY revenue DESC
                LIMIT 5
            """
            revenue_df = fetch_data(vendor_revenue_query)
            if not revenue_df.empty:
                revenue_df.set_index('vendor_name', inplace=True)
                st.bar_chart(revenue_df['revenue'], color="#2196F3") # Nice blue color
            else:
                st.info("No revenue data available yet.")
        except Exception:
            st.info("No revenue data available yet.")
            
    st.divider()
    
    # --- 3. LIVE FLEET STATUS (Dataframe) ---
    st.subheader("📋 Active Deliveries Pipeline")
    
    try:
        active_orders_query = """
            SELECT o.id as "Order ID", u.name as "Vendor", o.status as "Status", 
                   o.delivery_location as "Destination", o.total_amount as "Total ($)", 
                   TO_CHAR(o.updated_at, 'HH24:MI:SS') as "Last Update"
            FROM orders o
            JOIN users u ON o.vendor_id = u.id
            WHERE o.status IN ('pending', 'preparing', 'out_for_delivery')
            ORDER BY o.updated_at DESC
        """
        active_df = fetch_data(active_orders_query)
        
        if not active_df.empty:
            st.dataframe(active_df, use_container_width=True, hide_index=True)
        else:
            st.success("✨ All clear! No pending or active deliveries right now.")
    except Exception:
         st.success("✨ All clear! No pending or active deliveries right now.")

    st.divider()
    
    # ==========================================
    # SPRINT 8: LIVE FLEET TRACKING MAP & CONTROL
    # ==========================================
    # Split the bottom section into Map (Left) and Controls (Right)
    map_col, control_col = st.columns([2, 1])

    with map_col:
        st.subheader("🗺️ Live Fleet Tracking")
        st.markdown("Real-time GPS telemetry from AWS IoT Core.")
        
        loc = fetch_cart_location("cart_001") 
        
        if loc and 'lat' in loc and 'lon' in loc:
            battery = loc.get('battery_level', loc.get('battery', 100))
            status = loc.get('status', 'moving').upper()
            
            # Show a nice status bar
            st.info(f"🟢 **cart_001** is ONLINE | 🔋 Battery: {battery}% | 📡 Status: {status}")
            
            # Plot location
            df = pd.DataFrame({
                "lat": [float(loc['lat'])],
                "lon": [float(loc['lon'])]
            })
            st.map(df, zoom=16)
        else:
            st.warning("📡 Waiting for live GPS signals from active carts...")
            st.markdown("*(Hint: Ensure your `simulate_cart.py` script is running)*")

    with control_col:
        st.subheader("🎮 Remote Command")
        st.markdown("Override autonomous systems.")
        
        target_cart = st.text_input("Target Cart ID", value="cart_001")
        
        st.markdown("#### Actions")
        if st.button("🔓 Force Unlock Doors", type="primary", use_container_width=True):
            headers = {'Authorization': st.session_state['admin_token'], 'Content-Type': 'application/json'}
            try:
                res = requests.post(f"{config.API_BASE_URL}/carts/{target_cart}/command", json={"action": "unlock"}, headers=headers)
                if res.status_code == 200:
                    st.toast('Unlock command dispatched via IoT Core!', icon='✅')
                else:
                    st.error(f"Failed: {res.text}")
            except Exception as e:
                st.error(f"API Error: {e}")

        if st.button("🛑 EMERGENCY STOP", use_container_width=True):
            headers = {'Authorization': st.session_state['admin_token'], 'Content-Type': 'application/json'}
            try:
                res = requests.post(f"{config.API_BASE_URL}/carts/{target_cart}/command", json={"action": "emergency_stop"}, headers=headers)
                if res.status_code == 200:
                    st.toast('EMERGENCY STOP dispatched!', icon='🛑')
                    st.error(f"🚨 EMERGENCY STOP SENT TO {target_cart}")
                else:
                    st.error(f"Failed: {res.text}")
            except Exception as e:
                st.error(f"API Error: {e}")