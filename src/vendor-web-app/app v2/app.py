import streamlit as st
import requests
import boto3
import pandas as pd
import config

# --- Authentication Helper ---
def login_cognito(username, password):
    client = boto3.client('cognito-idp', region_name=config.COGNITO_REGION)
    try:
        response = client.initiate_auth(
            ClientId=config.COGNITO_CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={
                'USERNAME': username,
                'PASSWORD': password,
            }
        )
        return response['AuthenticationResult']['IdToken']
    except client.exceptions.NotAuthorizedException:
        st.error("Incorrect username or password.")
        return None
    except Exception as e:
        st.error(f"Login failed: {e}")
        return None

# --- API Helper Functions ---
def get_headers():
    return {'Authorization': st.session_state['token'], 'Content-Type': 'application/json'}

def fetch_profile():
    try:
        res = requests.get(f"{config.API_BASE_URL}/users/me", headers=get_headers())
        if res.status_code == 200:
            return res.json()
        return None
    except: return None

def fetch_orders(vendor_id):
    res = requests.get(f"{config.API_BASE_URL}/vendors/{vendor_id}/orders", headers=get_headers())
    if res.status_code == 200:
        return res.json()
    return []

def fetch_inventory():
    res = requests.get(f"{config.API_BASE_URL}/users/me/products", headers=get_headers())
    if res.status_code == 200:
        return res.json()
    return []

def update_order_status(order_id, status):
    payload = {"status": status}
    res = requests.put(f"{config.API_BASE_URL}/orders/{order_id}/status", json=payload, headers=get_headers())
    if res.status_code == 200:
        st.success(f"Order #{order_id} status updated to {status}!")
        st.rerun()
    else:
        st.error(f"Failed to update status: {res.text}")

def add_product(name, sku, price, stock, desc, img):
    payload = {
        "name": name, "sku": sku, "price": float(price), 
        "quantity_in_stock": int(stock), "description": desc, "image_url": img
    }
    res = requests.post(f"{config.API_BASE_URL}/users/me/products", json=payload, headers=get_headers())
    if res.status_code == 201:
        st.success("Product added successfully!")
        st.rerun()
    else:
        st.error(f"Error adding product: {res.text}")

def fetch_analytics():
    res = requests.get(f"{config.API_BASE_URL}/users/me/analytics", headers=get_headers())
    if res.status_code == 200:
        return res.json()
    return {"revenue": 0, "orders": 0}

# --- UI Layout ---
st.set_page_config(page_title="CARTA Vendor Portal", page_icon="🛒", layout="wide")

# Initialize Session State
if 'token' not in st.session_state:
    st.session_state['token'] = None
if 'profile' not in st.session_state:
    st.session_state['profile'] = None

# --- LOGIN SCREEN ---
if not st.session_state['token']:
    col1, col2, col3 = st.columns([1, 2, 1])
    with col2:
        st.title("🛒 CARTA Vendor Login")
        username = st.text_input("Username")
        password = st.text_input("Password", type="password")
        if st.button("Log In", type="primary"):
            token = login_cognito(username, password)
            if token:
                st.session_state['token'] = token
                st.rerun()

# --- MAIN DASHBOARD ---
else:
    # Fetch Profile (First time)
    if not st.session_state['profile']:
        profile = fetch_profile()
        if not profile:
            st.error("Could not fetch profile. Ensure you ran the 'create_vendor.py' script.")
            if st.button("Logout"):
                st.session_state['token'] = None
                st.rerun()
            st.stop()
        st.session_state['profile'] = profile

    profile = st.session_state['profile']
    
    # Sidebar
    with st.sidebar:
        st.header(f"🏪 {profile['name']}")
        st.write(f"📍 {profile.get('compound', 'Unknown Location')}")
        st.divider()
        if st.button("Log Out"):
            st.session_state['token'] = None
            st.session_state['profile'] = None
            st.rerun()

    # Tabs
    tab1, tab2, tab3 = st.tabs(["📦 Incoming Orders", "📋 Inventory", "📊 Analytics"])

    # --- TAB 1: ORDERS (The Dispatch Center) ---
    with tab1:
        st.header("Active Orders")
        orders = fetch_orders(profile['id'])
        
        if not orders:
            st.info("No active orders at the moment.")
        else:
            for order in orders:
                with st.expander(f"Order #{order['id']} - {order['status'].upper()} - ${order['total_amount']}"):
                    c1, c2, c3 = st.columns(3)
                    c1.write(f"**Location:** {order['delivery_location']}")
                    c2.write(f"**Created:** {order['created_at']}")
                    
                    # Action Buttons
                    if order['status'] == 'pending':
                        if c3.button("Accept & Prepare", key=f"prep_{order['id']}"):
                            update_order_status(order['id'], 'preparing')
                    elif order['status'] == 'preparing':
                        if c3.button("Ready for Pickup", key=f"ready_{order['id']}"):
                            update_order_status(order['id'], 'ready_for_pickup')
                    elif order['status'] == 'ready_for_pickup':
                        # This is the IoT Trigger!
                        if c3.button("🚀 DISPATCH CART", type="primary", key=f"go_{order['id']}"):
                            update_order_status(order['id'], 'out_for_delivery')
                            # Simulation Button
                        if c3.button("Simulate Delivered", key=f"del_{order['id']}"):
                            update_order_status(order['id'], 'delivered')
                    else:
                        c3.success(f"Status: {order['status']}")

    # --- TAB 2: INVENTORY ---
    with tab2:
        st.header("Manage Products")
        
        # Add New Product Form
        with st.expander("➕ Add New Product"):
            with st.form("add_prod"):
                n = st.text_input("Name")
                s = st.text_input("SKU")
                d = st.text_input("Description")
                i = st.text_input("Image URL", value="https://placehold.co/100")
                c1, c2 = st.columns(2)
                p = c1.number_input("Price", min_value=0.0, step=0.5)
                q = c2.number_input("Stock", min_value=0, step=1)
                if st.form_submit_button("Add Product"):
                    add_product(n, s, p, q, d, i)

        # List Products
        products = fetch_inventory()
        if products:
            df = pd.DataFrame(products)
            st.dataframe(
                df[['name', 'sku', 'price', 'quantity_in_stock']], 
                use_container_width=True,
                hide_index=True
            )
        else:
            st.warning("No products found.")

    # --- TAB 3: ANALYTICS ---
    with tab3:
        st.header("Sales Performance")
        stats = fetch_analytics()
        
        col1, col2 = st.columns(2)
        col1.metric("Total Revenue", f"${stats.get('revenue', 0)}")
        col2.metric("Total Orders", stats.get('orders', 0))