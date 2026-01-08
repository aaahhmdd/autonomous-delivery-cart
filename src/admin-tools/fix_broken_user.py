import boto3
import requests
import getpass
import config

# Initialize Cognito
client = boto3.client('cognito-idp', region_name=config.COGNITO_REGION)

def fix_user():
    print("--- 🔧 Fix Broken User Profile ---")
    username = input("Username/Email: ").strip()
    password = getpass.getpass("Password: ").strip()
    
    # 1. Log In
    print("Logging in...")
    try:
        auth = client.initiate_auth(
            ClientId=config.COGNITO_CLIENT_ID,
            AuthFlow='USER_PASSWORD_AUTH',
            AuthParameters={'USERNAME': username, 'PASSWORD': password}
        )
        token = auth['AuthenticationResult']['IdToken']
    except Exception as e:
        print(f"❌ Login Failed: {e}")
        return

    # 2. Create Profile
    print("Creating missing DB profile...")
    compound = input("Enter Compound (e.g. Palm Hills): ").strip()
    
    payload = {
        "name": username,
        "phone_number": "+201000000000", # Default
        "default_delivery_address": "Fixed by Admin",
        "compound": compound
    }
    
    headers = {'Authorization': token}
    res = requests.post(f"{config.API_BASE_URL}/users/me", json=payload, headers=headers)
    
    if res.status_code in [200, 201]:
        print("✅ Success! User is fixed. You can login now.")
    else:
        print(f"❌ Failed: {res.text}")

if __name__ == "__main__":
    fix_user()


'''

3.  **Run it:** `python fix_broken_user.py` -> Enter credentials -> Enter Compound.
4.  **Try the App:** Go back to your Customer App and refresh. It should work now.

---

### Option 2: Update `customer-app-python/app.py` (Permanent Fix)

The current Customer App code I gave you just says "User is broken" and stops. We should make it **smart enough to fix itself**, just like the Vendor Portal does.

**Update the `PHASE 2` section of your `customer-app-python/app.py`** (around line 105) to look like this:

```python
# ... inside app.py ...

# === PHASE 2: SHOPPING APP ===
else:
    profile = fetch_profile()
    
    # --- AUTO-FIX LOGIC START ---
    if not profile:
        st.warning("⚠️ Profile missing in Database. Let's fix that.")
        
        with st.form("fix_profile"):
            st.write("Complete your profile to continue:")
            fix_name = st.text_input("Name")
            fix_phone = st.text_input("Phone")
            fix_compound = st.text_input("Compound")
            fix_address = st.text_input("Address")
            
            if st.form_submit_button("Create Profile"):
                if create_backend_profile(fix_name, fix_phone, fix_address, fix_compound):
                    st.success("Profile Created!")
                    st.rerun()
                else:
                    st.error("Failed to create profile.")
        
        if st.button("Logout"): 
            st.session_state['token'] = None
            st.rerun()
        st.stop() # Stop here until fixed
    # --- AUTO-FIX LOGIC END ---

    st.sidebar.title(f"👤 {profile['name']}")
    # ... rest of the app ...

    '''