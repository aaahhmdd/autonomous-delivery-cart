'''
import streamlit as st
import requests
import boto3
import config
from botocore.exceptions import ClientError

# --- AUTH FUNCTIONS ---
def sign_up_cognito(email, password, name, phone):
    client = boto3.client('cognito-idp', region_name=config.COGNITO_REGION)
    try:
        client.sign_up(
            ClientId=config.COGNITO_CLIENT_ID,
            Username=email, 
            Password=password,
            UserAttributes=[
                {'Name': 'email', 'Value': email},
                {'Name': 'name', 'Value': name},
                {'Name': 'phone_number', 'Value': phone}
            ]
        )
        return True, "User created. Please check email for code."
    except ClientError as e:
        return False, e.response['Error']['Message']

def confirm_user(username, code):
    client = boto3.client('cognito-idp', region_name=config.COGNITO_REGION)
    try:
        client.confirm_sign_up(
            ClientId=config.COGNITO_CLIENT_ID,
            Username=username,
            ConfirmationCode=code
        )
        return True, "Confirmed!"
    except ClientError as e:
        return False, e.response['Error']['Message']

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
        # Return the specific error code to handle unconfirmed users
        return None, e.response['Error']['Code']
    except Exception as e:
        return None, str(e)

# --- API FUNCTIONS ---
def get_headers():
    return {'Authorization': st.session_state['token'], 'Content-Type': 'application/json'}

def create_backend_profile(name, phone, address, compound):
    payload = { "name": name, "phone_number": phone, "default_delivery_address": address, "compound": compound }
    try:
        res = requests.post(f"{config.API_BASE_URL}/users/me", json=payload, headers=get_headers())
        return res.status_code in [200, 201]
    except: return False

def fetch_profile():
    try:
        res = requests.get(f"{config.API_BASE_URL}/users/me", headers=get_headers())
        if res.status_code == 200: return res.json()
    except: pass
    return None

def fetch_vendors(compound):
    try:
        res = requests.get(f"{config.API_BASE_URL}/vendors?compound={compound}")
        if res.status_code == 200: return res.json()
    except: pass
    return []

def fetch_products(vendor_id):
    try:
        res = requests.get(f"{config.API_BASE_URL}/vendors/{vendor_id}/products")
        if res.status_code == 200: return res.json()
    except: pass
    return []

def place_order(vendor_id, items, address):
    payload = { "vendor_id": vendor_id, "delivery_location": address, "items": items }
    res = requests.post(f"{config.API_BASE_URL}/orders", json=payload, headers=get_headers())
    return res

def fetch_my_orders():
    try:
        res = requests.get(f"{config.API_BASE_URL}/orders", headers=get_headers())
        if res.status_code == 200: return res.json()
    except: pass
    return []

# --- UI LOGIC ---
st.set_page_config(page_title="CARTA Customer App", page_icon="📱")

# State Management
if 'token' not in st.session_state: st.session_state['token'] = None
if 'cart' not in st.session_state: st.session_state['cart'] = []
if 'unconfirmed_user' not in st.session_state: st.session_state['unconfirmed_user'] = None

# === PHASE 1: AUTHENTICATION ===
if not st.session_state['token']:
    st.title("📱 Customer Login / Sign Up")

    # 1. HANDLE UNCONFIRMED USER (The "Rescue" Screen)
    if st.session_state['unconfirmed_user']:
        st.warning(f"Account '{st.session_state['unconfirmed_user']}' is not verified yet.")
        with st.form("verify_form"):
            code = st.text_input("Enter Verification Code from Email")
            pw_verify = st.text_input("Confirm Password to Login", type="password")
            if st.form_submit_button("Verify Account"):
                success, msg = confirm_user(st.session_state['unconfirmed_user'], code)
                if success:
                    st.success("Verified! Logging in...")
                    # Auto login after verify
                    token, err = login_cognito(st.session_state['unconfirmed_user'], pw_verify)
                    if token:
                        st.session_state['token'] = token
                        st.session_state['unconfirmed_user'] = None
                        st.rerun()
                    else:
                        st.error(f"Verification success, but login failed: {err}")
                else:
                    st.error(msg)
        
        if st.button("Back to Login"):
            st.session_state['unconfirmed_user'] = None
            st.rerun()
            
    # 2. STANDARD LOGIN / SIGNUP
    else:
        tab1, tab2 = st.tabs(["Log In", "Sign Up (New User)"])
        
        with tab1:
            email = st.text_input("Email")
            pw = st.text_input("Password", type="password")
            if st.button("Log In"):
                token, error_code = login_cognito(email, pw)
                if token:
                    st.session_state['token'] = token
                    st.rerun()
                elif error_code == 'UserNotConfirmedException':
                    # Catch the broken state and redirect
                    st.session_state['unconfirmed_user'] = email
                    st.rerun()
                else:
                    st.error(f"Login Failed: {error_code}")

        with tab2:
            st.write("Create a new account.")
            new_name = st.text_input("Full Name (e.g. Youssef)")
            new_email = st.text_input("Email (Real one for code)")
            new_phone = st.text_input("Phone (+20...)")
            new_pw = st.text_input("New Password", type="password")
            # We collect these here but save them to DB only after verification
            
            if st.button("Sign Up"):
                if "Vendor" in new_name:
                    st.error("Customers cannot have 'Vendor' in their name!")
                else:
                    success, msg = sign_up_cognito(new_email, new_pw, new_name, new_phone)
                    if success:
                        st.session_state['unconfirmed_user'] = new_email
                        st.success("Account created! Redirecting to verification...")
                        st.rerun()
                    else:
                        st.error(msg)

# === PHASE 2: SHOPPING APP ===
else:
    # 1. Fetch Profile
    profile = fetch_profile()
    
    # 2. AUTO-FIX: Handle Broken Users (Cognito Yes, DB No)
    if not profile:
        st.warning("⚠️ Account exists, but Profile is missing in Database.")
        st.info("Please complete your registration details to continue.")
        
        with st.form("fix_profile"):
            fix_name = st.text_input("Full Name")
            fix_phone = st.text_input("Phone Number")
            fix_compound = st.text_input("Compound (e.g. Palm Hills)")
            fix_address = st.text_input("Default Address")
            
            if st.form_submit_button("Create Profile"):
                if create_backend_profile(fix_name, fix_phone, fix_address, fix_compound):
                    st.success("Profile Created Successfully! reloading...")
                    st.rerun()
                else:
                    st.error("Failed to save profile. Check API connection.")
        
        if st.button("Logout"): 
            st.session_state['token'] = None
            st.rerun()
        st.stop() 

    # 3. Standard App Flow 
    st.sidebar.title(f"👤 {profile['name']}")
    st.sidebar.write(f"📍 {profile.get('compound', 'Unknown')}")
    if st.sidebar.button("Logout"):
        st.session_state['token'] = None
        st.rerun()

    tab_shop, tab_cart, tab_orders = st.tabs(["🛍️ Shop", "🛒 Cart", "📦 My Orders"])

    # --- SHOPPING TAB ---
    with tab_shop:
        compound = profile.get('compound', '')
        if not compound:
             st.error("Your profile is missing a 'Compound'. Update DB.")
        else:
            st.header(f"Shops in {compound}")
            vendors = fetch_vendors(compound)
            
            if not vendors:
                st.warning(f"No vendors found in {compound}. (Did you create a vendor there?)")
            
            for vendor in vendors:
                with st.expander(f"🏪 {vendor['name']}"):
                    products = fetch_products(vendor['id'])
                    for p in products:
                        c1, c2, c3 = st.columns([3, 1, 1])
                        c1.write(f"**{p['name']}** - {p['description']}")
                        c2.write(f"${p['price']}")
                        if c3.button("Add", key=f"add_{p['id']}"):
                            st.session_state['cart'].append({
                                "vendor_id": vendor['id'],
                                "product_id": p['id'],
                                "name": p['name'],
                                "price": float(p['price']),
                                "vendor_name": vendor['name']
                            })
                            st.success("Added!")

    # --- CART TAB ---
    with tab_cart:
        st.header("Your Cart")
        if not st.session_state['cart']:
            st.info("Cart is empty.")
        else:
            cart_df = st.session_state['cart']
            for item in cart_df:
                st.write(f"- {item['name']} (${item['price']}) from {item['vendor_name']}")
            
            if st.button("Place Order (All Items)"):
                vid = cart_df[0]['vendor_id']
                items = [{"product_id": i['product_id'], "quantity": 1} for i in cart_df]
                
                res = place_order(vid, items, profile['default_delivery_address'])
                if res.status_code == 201:
                    st.balloons()
                    st.success(f"Order Placed! ID: {res.json()['orderId']}")
                    st.session_state['cart'] = []
                    st.rerun()
                else:
                    st.error(f"Failed: {res.text}")
            
            if st.button("Clear Cart"):
                st.session_state['cart'] = []
                st.rerun()

    # --- ORDERS TAB ---
    with tab_orders:
        st.header("Order History")
        orders = fetch_my_orders()
        for o in orders:
            status_emoji = "🕒" if o['status'] == 'pending' else "🍳" if o['status'] == 'preparing' else "🚚" if o['status'] == 'out_for_delivery' else "✅"
            st.write(f"{status_emoji} **Order #{o['id']}** - {o['status'].upper()} - ${o['total_amount']}")
            if o['status'] == 'out_for_delivery':
                st.info("The cart is on its way!")







#  V 2

import streamlit as st
import requests
import boto3
import pandas as pd
import config
from botocore.exceptions import ClientError

# --- AUTH FUNCTIONS ---
def sign_up_cognito(email, password, name, phone):
    client = boto3.client('cognito-idp', region_name=config.COGNITO_REGION)
    try:
        client.sign_up(
            ClientId=config.COGNITO_CLIENT_ID,
            Username=email, 
            Password=password,
            UserAttributes=[
                {'Name': 'email', 'Value': email},
                {'Name': 'name', 'Value': name},
                {'Name': 'phone_number', 'Value': phone}
            ]
        )
        return True, "User created. Please check email for code."
    except ClientError as e:
        return False, e.response['Error']['Message']

def confirm_user(username, code):
    client = boto3.client('cognito-idp', region_name=config.COGNITO_REGION)
    try:
        client.confirm_sign_up(
            ClientId=config.COGNITO_CLIENT_ID,
            Username=username,
            ConfirmationCode=code
        )
        return True, "Confirmed!"
    except ClientError as e:
        return False, e.response['Error']['Message']

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
        return None, e.response['Error']['Code']
    except Exception as e:
        return None, str(e)

# --- API FUNCTIONS ---
def get_headers():
    return {'Authorization': st.session_state['token'], 'Content-Type': 'application/json'}

def create_backend_profile(name, phone, address, compound):
    payload = { "name": name, "phone_number": phone, "default_delivery_address": address, "compound": compound }
    try:
        res = requests.post(f"{config.API_BASE_URL}/users/me", json=payload, headers=get_headers())
        return res.status_code in [200, 201]
    except: return False

def fetch_profile():
    try:
        res = requests.get(f"{config.API_BASE_URL}/users/me", headers=get_headers())
        if res.status_code == 200: return res.json()
    except: pass
    return None

def fetch_vendors(compound):
    try:
        res = requests.get(f"{config.API_BASE_URL}/vendors?compound={compound}")
        if res.status_code == 200: return res.json()
    except: pass
    return []

def fetch_products(vendor_id):
    try:
        res = requests.get(f"{config.API_BASE_URL}/vendors/{vendor_id}/products")
        if res.status_code == 200: return res.json()
    except: pass
    return []

def place_order(vendor_id, items, address):
    payload = { "vendor_id": vendor_id, "delivery_location": address, "items": items }
    res = requests.post(f"{config.API_BASE_URL}/orders", json=payload, headers=get_headers())
    return res

def fetch_my_orders():
    try:
        res = requests.get(f"{config.API_BASE_URL}/orders", headers=get_headers())
        if res.status_code == 200: return res.json()
    except: pass
    return []

# SPRINT 6: Fetch Cart Location
def fetch_cart_location(cart_id):
    try:
        res = requests.get(f"{config.API_BASE_URL}/carts/{cart_id}/location", headers=get_headers())
        if res.status_code == 200: return res.json()
    except: pass
    return None

# --- UI LOGIC ---
st.set_page_config(page_title="CARTA Customer App", page_icon="📱")

# State Management
if 'token' not in st.session_state: st.session_state['token'] = None
if 'cart' not in st.session_state: st.session_state['cart'] = []
if 'unconfirmed_user' not in st.session_state: st.session_state['unconfirmed_user'] = None

# === PHASE 1: AUTHENTICATION ===
if not st.session_state['token']:
    st.title("📱 Customer Login / Sign Up")

    # 1. HANDLE UNCONFIRMED USER
    if st.session_state['unconfirmed_user']:
        st.warning(f"Account '{st.session_state['unconfirmed_user']}' is not verified yet.")
        with st.form("verify_form"):
            code = st.text_input("Enter Verification Code from Email")
            pw_verify = st.text_input("Confirm Password to Login", type="password")
            if st.form_submit_button("Verify Account"):
                success, msg = confirm_user(st.session_state['unconfirmed_user'], code)
                if success:
                    st.success("Verified! Logging in...")
                    token, err = login_cognito(st.session_state['unconfirmed_user'], pw_verify)
                    if token:
                        st.session_state['token'] = token
                        st.session_state['unconfirmed_user'] = None
                        st.rerun()
                    else:
                        st.error(f"Verification success, but login failed: {err}")
                else:
                    st.error(msg)
        
        if st.button("Back to Login"):
            st.session_state['unconfirmed_user'] = None
            st.rerun()
            
    # 2. STANDARD LOGIN / SIGNUP
    else:
        tab1, tab2 = st.tabs(["Log In", "Sign Up (New User)"])
        
        with tab1:
            email = st.text_input("Email")
            pw = st.text_input("Password", type="password")
            if st.button("Log In"):
                token, error_code = login_cognito(email, pw)
                if token:
                    st.session_state['token'] = token
                    st.rerun()
                elif error_code == 'UserNotConfirmedException':
                    st.session_state['unconfirmed_user'] = email
                    st.rerun()
                else:
                    st.error(f"Login Failed: {error_code}")

        with tab2:
            st.write("Create a new account.")
            new_name = st.text_input("Full Name (e.g. Youssef)")
            new_email = st.text_input("Email (Real one for code)")
            new_phone = st.text_input("Phone (+20...)")
            new_pw = st.text_input("New Password", type="password")
            
            if st.button("Sign Up"):
                if "Vendor" in new_name:
                    st.error("Customers cannot have 'Vendor' in their name!")
                else:
                    success, msg = sign_up_cognito(new_email, new_pw, new_name, new_phone)
                    if success:
                        st.session_state['unconfirmed_user'] = new_email
                        st.success("Account created! Redirecting to verification...")
                        st.rerun()
                    else:
                        st.error(msg)

# === PHASE 2: SHOPPING APP ===
else:
    profile = fetch_profile()
    
    # AUTO-FIX: Handle Broken Users (Cognito Yes, DB No)
    if not profile:
        st.warning("⚠️ Account exists, but Profile is missing in Database.")
        st.info("Please complete your registration details to continue.")
        
        with st.form("fix_profile"):
            fix_name = st.text_input("Full Name")
            fix_phone = st.text_input("Phone Number")
            fix_compound = st.text_input("Compound (e.g. Palm Hills)")
            fix_address = st.text_input("Default Address")
            
            if st.form_submit_button("Create Profile"):
                if create_backend_profile(fix_name, fix_phone, fix_address, fix_compound):
                    st.success("Profile Created Successfully! reloading...")
                    st.rerun()
                else:
                    st.error("Failed to save profile. Check API connection.")
        
        if st.button("Logout"): 
            st.session_state['token'] = None
            st.rerun()
        st.stop() 

    # Standard App Flow 
    st.sidebar.title(f"👤 {profile['name']}")
    st.sidebar.write(f"📍 {profile.get('compound', 'Unknown')}")
    if st.sidebar.button("Logout"):
        st.session_state['token'] = None
        st.rerun()

    tab_shop, tab_cart, tab_orders = st.tabs(["🛍️ Shop", "🛒 Cart", "📦 My Orders"])

    # --- SHOPPING TAB ---
    with tab_shop:
        compound = profile.get('compound', '')
        if not compound:
             st.error("Your profile is missing a 'Compound'. Update DB.")
        else:
            st.header(f"Shops in {compound}")
            vendors = fetch_vendors(compound)
            
            if not vendors:
                st.warning(f"No vendors found in {compound}. (Did you create a vendor there?)")
            
            for vendor in vendors:
                with st.expander(f"🏪 {vendor['name']}"):
                    products = fetch_products(vendor['id'])
                    for p in products:
                        c1, c2, c3 = st.columns([3, 1, 1])
                        c1.write(f"**{p['name']}** - {p['description']}")
                        c2.write(f"${p['price']}")
                        if c3.button("Add", key=f"add_{p['id']}"):
                            st.session_state['cart'].append({
                                "vendor_id": vendor['id'],
                                "product_id": p['id'],
                                "name": p['name'],
                                "price": float(p['price']),
                                "vendor_name": vendor['name']
                            })
                            st.success("Added!")

    # --- CART TAB ---
    with tab_cart:
        st.header("Your Cart")
        if not st.session_state['cart']:
            st.info("Cart is empty.")
        else:
            cart_df = st.session_state['cart']
            for item in cart_df:
                st.write(f"- {item['name']} (${item['price']}) from {item['vendor_name']}")
            
            if st.button("Place Order (All Items)"):
                vid = cart_df[0]['vendor_id']
                items = [{"product_id": i['product_id'], "quantity": 1} for i in cart_df]
                
                res = place_order(vid, items, profile['default_delivery_address'])
                if res.status_code == 201:
                    st.balloons()
                    st.success(f"Order Placed! ID: {res.json()['orderId']}")
                    st.session_state['cart'] = []
                    st.rerun()
                else:
                    st.error(f"Failed: {res.text}")
            
            if st.button("Clear Cart"):
                st.session_state['cart'] = []
                st.rerun()

    # --- ORDERS TAB ---
    with tab_orders:
        st.header("Order History")
        
        # Add an auto-refresh button for tracking
        if st.button("🔄 Refresh Status & Location"):
            st.rerun()
            
        orders = fetch_my_orders()
        for o in orders:
            status_emoji = "🕒" if o['status'] == 'pending' else "🍳" if o['status'] == 'preparing' else "🚚" if o['status'] == 'out_for_delivery' else "✅"
            
            with st.container():
                st.write(f"### {status_emoji} Order #{o['id']} - {o['status'].replace('_', ' ').upper()}")
                st.write(f"**Total:** ${o['total_amount']} | **Date:** {o['created_at'][:10]}")
                
                # SPRINT 6: LIVE TRACKING UI
                # SPRINT 6: LIVE TRACKING UI
                if o['status'] == 'out_for_delivery':
                    st.info("🤖 The autonomous cart is on its way!")
                    
                    # Fetch real-time location from DynamoDB via our new API
                    loc = fetch_cart_location("cart_001") # Using cart_001 for demo
                    
                    # Safely check for either spelling (lat/latitude)
                    if loc and ('latitude' in loc or 'lat' in loc):
                        # Extract data safely
                        cart_lat = float(loc.get('latitude', loc.get('lat')))
                        cart_lon = float(loc.get('longitude', loc.get('lon')))
                        battery = loc.get('battery_level', loc.get('battery', 'Unknown'))
                        
                        st.success(f"🔋 Cart Battery: {battery}% | Status: {loc.get('status', 'moving')}")
                        
                        # Plot location on Streamlit Map
                        df = pd.DataFrame({
                            "lat": [cart_lat],
                            "lon": [cart_lon]
                        })
                        st.map(df, zoom=15)
                    else:
                        # Print the raw response to the screen so we can see what's actually coming back!
                        st.warning("Waiting for GPS signal from the cart...")
                        st.write("Debug - Raw API Response:", loc)
                
                st.divider()

'''


# v3

import streamlit as st
import requests
import boto3
import pandas as pd
import config
from botocore.exceptions import ClientError

# --- AUTH FUNCTIONS ---
def sign_up_cognito(email, password, name, phone):
    client = boto3.client('cognito-idp', region_name=config.COGNITO_REGION)
    try:
        client.sign_up(
            ClientId=config.COGNITO_CLIENT_ID,
            Username=email, 
            Password=password,
            UserAttributes=[
                {'Name': 'email', 'Value': email},
                {'Name': 'name', 'Value': name},
                {'Name': 'phone_number', 'Value': phone}
            ]
        )
        return True, "User created. Please check email for code."
    except ClientError as e:
        return False, e.response['Error']['Message']

def confirm_user(username, code):
    client = boto3.client('cognito-idp', region_name=config.COGNITO_REGION)
    try:
        client.confirm_sign_up(
            ClientId=config.COGNITO_CLIENT_ID,
            Username=username,
            ConfirmationCode=code
        )
        return True, "Confirmed!"
    except ClientError as e:
        return False, e.response['Error']['Message']

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
        return None, e.response['Error']['Code']
    except Exception as e:
        return None, str(e)

# --- API FUNCTIONS ---
def get_headers():
    return {'Authorization': st.session_state['token'], 'Content-Type': 'application/json'}

def create_backend_profile(name, phone, address, compound):
    payload = { "name": name, "phone_number": phone, "default_delivery_address": address, "compound": compound }
    try:
        res = requests.post(f"{config.API_BASE_URL}/users/me", json=payload, headers=get_headers())
        return res.status_code in [200, 201]
    except: return False

def fetch_profile():
    try:
        res = requests.get(f"{config.API_BASE_URL}/users/me", headers=get_headers())
        if res.status_code == 200: return res.json()
    except: pass
    return None

def fetch_vendors(compound):
    try:
        res = requests.get(f"{config.API_BASE_URL}/vendors?compound={compound}")
        if res.status_code == 200: return res.json()
    except: pass
    return []

def fetch_products(vendor_id):
    try:
        res = requests.get(f"{config.API_BASE_URL}/vendors/{vendor_id}/products")
        if res.status_code == 200: return res.json()
    except: pass
    return []

# NEW: Accept lat and lon parameters
def place_order(vendor_id, items, address, lat, lon):
    payload = { 
        "vendor_id": vendor_id, 
        "delivery_location": address, 
        "delivery_lat": lat,
        "delivery_lon": lon,
        "items": items 
    }
    res = requests.post(f"{config.API_BASE_URL}/orders", json=payload, headers=get_headers())
    return res

def fetch_my_orders():
    try:
        res = requests.get(f"{config.API_BASE_URL}/orders", headers=get_headers())
        if res.status_code == 200: return res.json()
    except: pass
    return []

# SPRINT 6: Fetch Cart Location
def fetch_cart_location(cart_id):
    try:
        res = requests.get(f"{config.API_BASE_URL}/carts/{cart_id}/location", headers=get_headers())
        if res.status_code == 200: return res.json()
    except: pass
    return None

# NEW SPRINT 8: Verify and Unlock (DEBUG MODE)
def verify_and_unlock_cart(order_id, pin, cart_id="cart_001"):
    payload = { "pin": pin, "cart_id": cart_id }
    url = f"{config.API_BASE_URL}/orders/{order_id}/verify-unlock"
    
    st.write(f"🔧 **Debug URL:** `{url}`") # Let's see exactly where it's sending it
    
    try:
        res = requests.post(url, json=payload, headers=get_headers())
        st.write(f"🔧 **Debug Backend Status:** `{res.status_code}`")
        st.write(f"🔧 **Debug Backend Response:** `{res.text}`")
        return res
    except Exception as e:
        st.error(f"🔧 **Debug Python Crash:** {str(e)}")
        return None

# --- UI LOGIC ---
st.set_page_config(page_title="CARTA Customer App", page_icon="📱")

# State Management
if 'token' not in st.session_state: st.session_state['token'] = None
if 'cart' not in st.session_state: st.session_state['cart'] = []
if 'unconfirmed_user' not in st.session_state: st.session_state['unconfirmed_user'] = None

# === PHASE 1: AUTHENTICATION ===
if not st.session_state['token']:
    st.title("📱 Customer Login / Sign Up")

    # 1. HANDLE UNCONFIRMED USER
    if st.session_state['unconfirmed_user']:
        st.warning(f"Account '{st.session_state['unconfirmed_user']}' is not verified yet.")
        with st.form("verify_form"):
            code = st.text_input("Enter Verification Code from Email")
            pw_verify = st.text_input("Confirm Password to Login", type="password")
            if st.form_submit_button("Verify Account"):
                success, msg = confirm_user(st.session_state['unconfirmed_user'], code)
                if success:
                    st.success("Verified! Logging in...")
                    token, err = login_cognito(st.session_state['unconfirmed_user'], pw_verify)
                    if token:
                        st.session_state['token'] = token
                        st.session_state['unconfirmed_user'] = None
                        st.rerun()
                    else:
                        st.error(f"Verification success, but login failed: {err}")
                else:
                    st.error(msg)
        
        if st.button("Back to Login"):
            st.session_state['unconfirmed_user'] = None
            st.rerun()
            
    # 2. STANDARD LOGIN / SIGNUP
    else:
        tab1, tab2 = st.tabs(["Log In", "Sign Up (New User)"])
        
        with tab1:
            email = st.text_input("Email")
            pw = st.text_input("Password", type="password")
            if st.button("Log In"):
                token, error_code = login_cognito(email, pw)
                if token:
                    st.session_state['token'] = token
                    st.rerun()
                elif error_code == 'UserNotConfirmedException':
                    st.session_state['unconfirmed_user'] = email
                    st.rerun()
                else:
                    st.error(f"Login Failed: {error_code}")

        with tab2:
            st.write("Create a new account.")
            new_name = st.text_input("Full Name (e.g. Youssef)")
            new_email = st.text_input("Email (Real one for code)")
            new_phone = st.text_input("Phone (+20...)")
            new_pw = st.text_input("New Password", type="password")
            
            if st.button("Sign Up"):
                if "Vendor" in new_name:
                    st.error("Customers cannot have 'Vendor' in their name!")
                else:
                    success, msg = sign_up_cognito(new_email, new_pw, new_name, new_phone)
                    if success:
                        st.session_state['unconfirmed_user'] = new_email
                        st.success("Account created! Redirecting to verification...")
                        st.rerun()
                    else:
                        st.error(msg)

# === PHASE 2: SHOPPING APP ===
else:
    profile = fetch_profile()
    
    # AUTO-FIX: Handle Broken Users (Cognito Yes, DB No)
    if not profile:
        st.warning("⚠️ Account exists, but Profile is missing in Database.")
        st.info("Please complete your registration details to continue.")
        
        with st.form("fix_profile"):
            fix_name = st.text_input("Full Name")
            fix_phone = st.text_input("Phone Number")
            fix_compound = st.text_input("Compound (e.g. Palm Hills)")
            fix_address = st.text_input("Default Address")
            
            if st.form_submit_button("Create Profile"):
                if create_backend_profile(fix_name, fix_phone, fix_address, fix_compound):
                    st.success("Profile Created Successfully! reloading...")
                    st.rerun()
                else:
                    st.error("Failed to save profile. Check API connection.")
        
        if st.button("Logout"): 
            st.session_state['token'] = None
            st.rerun()
        st.stop() 

    # Standard App Flow 
    st.sidebar.title(f"👤 {profile['name']}")
    st.sidebar.write(f"📍 {profile.get('compound', 'Unknown')}")
    if st.sidebar.button("Logout"):
        st.session_state['token'] = None
        st.rerun()

    tab_shop, tab_cart, tab_orders = st.tabs(["🛍️ Shop", "🛒 Cart", "📦 My Orders"])

    # --- SHOPPING TAB ---
    with tab_shop:
        compound = profile.get('compound', '')
        if not compound:
             st.error("Your profile is missing a 'Compound'. Update DB.")
        else:
            st.header(f"Shops in {compound}")
            vendors = fetch_vendors(compound)
            
            if not vendors:
                st.warning(f"No vendors found in {compound}. (Did you create a vendor there?)")
            
            for vendor in vendors:
                with st.expander(f"🏪 {vendor['name']}"):
                    products = fetch_products(vendor['id'])
                    for p in products:
                        c1, c2, c3 = st.columns([3, 1, 1])
                        c1.write(f"**{p['name']}** - {p['description']}")
                        c2.write(f"${p['price']}")
                        if c3.button("Add", key=f"add_{p['id']}"):
                            st.session_state['cart'].append({
                                "vendor_id": vendor['id'],
                                "product_id": p['id'],
                                "name": p['name'],
                                "price": float(p['price']),
                                "vendor_name": vendor['name']
                            })
                            st.success("Added!")

    # --- CART TAB ---
    with tab_cart:
        st.header("Your Cart")
        if not st.session_state['cart']:
            st.info("Cart is empty.")
        else:
            cart_df = st.session_state['cart']
            for item in cart_df:
                st.write(f"- {item['name']} (${item['price']}) from {item['vendor_name']}")
            
            # NEW: Ask the user for their exact GPS delivery coordinates
            st.divider()
            st.write("📍 **Where should the robot go?**")
            delivery_lat = st.number_input("Latitude", value=30.0444, format="%.6f")
            delivery_lon = st.number_input("Longitude", value=31.2357, format="%.6f")

            if st.button("Place Order (All Items)"):
                vid = cart_df[0]['vendor_id']
                items = [{"product_id": i['product_id'], "quantity": 1} for i in cart_df]
                
                # UPDATED: Pass the lat and lon to the API
                res = place_order(vid, items, profile['default_delivery_address'], delivery_lat, delivery_lon)
                if res.status_code == 201:
                    st.balloons()
                    st.success(f"Order Placed! ID: {res.json()['orderId']}")
                    st.session_state['cart'] = []
                    st.rerun()
                else:
                    st.error(f"Failed: {res.text}")
            
            if st.button("Clear Cart"):
                st.session_state['cart'] = []
                st.rerun()

    # --- ORDERS TAB ---
    with tab_orders:
        st.header("Order History")
        
        # Add an auto-refresh button for tracking
        if st.button("🔄 Refresh Status & Location"):
            st.rerun()
            
        orders = fetch_my_orders()
        for o in orders:
            status_emoji = "🕒" if o['status'] == 'pending' else "🍳" if o['status'] == 'preparing' else "🚚" if o['status'] == 'out_for_delivery' else "✅"
            
            with st.container():
                st.write(f"### {status_emoji} Order #{o['id']} - {o['status'].replace('_', ' ').upper()}")
                st.write(f"**Total:** ${o['total_amount']} | **Date:** {o['created_at'][:10]}")
                
                # SPRINT 6: LIVE TRACKING UI
                if o['status'] == 'out_for_delivery':
                    st.info("🤖 The autonomous cart is on its way!")
                    
                    # Fetch real-time location from DynamoDB via our new API
                    loc = fetch_cart_location("cart_001") # Using cart_001 for demo purposes
                    
                    # ✅ FIX 1: Look for 'lat' and 'lon' (matching your API response)
                    if loc and 'lat' in loc and 'lon' in loc:
                        # ✅ FIX 2: Match the battery key
                        st.success(f"🔋 Cart Battery: {loc.get('battery', 'Unknown')}% | Status: {loc.get('status', 'moving')}")
                        
                        # ✅ FIX 3: Use loc['lat'] and loc['lon'] instead of undefined variables
                        df = pd.DataFrame({
                            "lat": [float(loc['lat'])],
                            "lon": [float(loc['lon'])]
                        })
                        
                        # Plot location on Streamlit Map
                        st.map(df, zoom=15)
                    else:
                        st.warning("Waiting for GPS signal from the cart...")
                        st.write("Debug - Raw API Response:", loc)
                    
                    # --- NEW SPRINT 8: SECURE HANDOFF UI ---
                    st.divider()
                    st.subheader("🔐 Secure Handoff")
                    st.write("When the cart arrives at your location, enter the PIN sent to your email.")
                    pin_input = st.text_input("Enter 4-Digit PIN", key=f"pin_{o['id']}")
                    
                    if st.button("🔓 Verify & Unlock Cart Doors", key=f"btn_{o['id']}"):
                        if not pin_input:
                            st.error("Please enter the PIN.")
                        else:
                            with st.spinner("Verifying with AWS Cloud..."):
                                res = verify_and_unlock_cart(o['id'], pin_input)
                                if res and res.status_code == 200:
                                    st.balloons()
                                    st.success("✅ Success! Doors Unlocked. Your order is now marked as Delivered.")
                                    st.rerun() # Refresh app state
                                else:
                                    err_msg = res.json() if res else "Network Error"
                                    st.error(f"❌ Verification Failed: {err_msg}")
                
                st.divider()