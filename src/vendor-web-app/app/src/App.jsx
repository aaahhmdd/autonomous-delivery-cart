import React, { useState, useEffect } from 'react';
import { Amplify } from 'aws-amplify';
import { get, post, put } from 'aws-amplify/api';
import { signOut, fetchAuthSession } from 'aws-amplify/auth';
import { Authenticator, Button, Heading, Flex, Card, Text, Tabs, TextField, SelectField, Loader, View } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { LogOut, RefreshCw, Save, Edit, Plus, X, UserPlus } from 'lucide-react';

// ==========================================
// 1. AWS CONFIGURATION
// ==========================================
// ⚠️ REPLACE THESE WITH YOUR REAL TERMINAL OUTPUTS ⚠️
const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'me-south-1_zGVPjQVEL',       
      userPoolClientId: '2i528us5db3r4nuo44vfa0bsiq',    
    }
  },
  API: {
    REST: {
      DeliveryApi: {
        endpoint: 'https://l0ok59u6k4.execute-api.me-south-1.amazonaws.com/prod',           
        region: 'me-south-1'
      }
    }
  }
};

Amplify.configure(amplifyConfig);

// ==========================================
// 2. HELPER: GET AUTH HEADERS
// ==========================================
// This ensures we always send a fresh token
const getAuthHeaders = async () => {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) throw new Error("No token found");
    return { Authorization: token };
  } catch (e) {
    console.error("Auth Session Error:", e);
    throw e;
  }
};

// ==========================================
// 3. MAIN APP COMPONENT
// ==========================================
function App() {
  return (
    <Authenticator
      initialState="signIn"
      signUpAttributes={['email', 'name', 'phone_number']}
      components={{
        Header: () => <Heading level={3} padding="1rem" textAlign="center">CARTA Vendor Portal</Heading>
      }}
    >
      {({ signOut, user }) => (
        <Dashboard user={user} signOut={signOut} />
      )}
    </Authenticator>
  );
}

// ==========================================
// 4. DASHBOARD LOGIC
// ==========================================
function Dashboard({ user, signOut }) {
  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [needsProfile, setNeedsProfile] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // 1. Try to fetch profile
      try {
        const headers = await getAuthHeaders();
        const restOp = get({ 
          apiName: 'DeliveryApi', 
          path: '/users/me',
          options: { headers } // <--- Manual Headers
        });
        const response = await restOp.response;
        const profileData = await response.body.json();
        
        setProfile(profileData);
        setNeedsProfile(false);

        // 2. If profile exists, fetch other data
        if (profileData?.id) {
          await Promise.all([
            fetchOrders(profileData.id),
            fetchInventory()
          ]);
        }
      } catch (e) {
        // 3. Handle New User (404)
        if (e.response?.statusCode === 404) {
          console.log("User not found (404). prompting creation.");
          setNeedsProfile(true);
        } else {
          console.error("API Error:", e);
          // Don't alert on 404, only real errors
          if (e.response?.statusCode !== 404) alert("Connection Error. See console.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const createProfile = async (formData) => {
    try {
      const headers = await getAuthHeaders();
      const restOp = post({
        apiName: 'DeliveryApi',
        path: '/users/me',
        options: { body: formData, headers }
      });
      await restOp.response;
      setNeedsProfile(false);
      loadData();
    } catch (e) {
      console.error(e);
      alert("Failed to create profile.");
    }
  };

  const fetchOrders = async (vendorId) => {
    try {
      const headers = await getAuthHeaders();
      const restOp = get({ 
        apiName: 'DeliveryApi', 
        path: `/vendors/${vendorId}/orders`,
        options: { headers }
      });
      const response = await restOp.response;
      setOrders(await response.body.json());
    } catch (e) { console.error("Fetch Orders Error:", e); }
  };

  const fetchInventory = async () => {
    try {
      const headers = await getAuthHeaders();
      const restOp = get({ 
        apiName: 'DeliveryApi', 
        path: '/users/me/products',
        options: { headers }
      });
      const response = await restOp.response;
      const data = await response.body.json();
      setInventory(data.map(i => ({ ...i, isEditing: false })));
    } catch (e) { console.error("Fetch Inventory Error:", e); }
  };

  // --- RENDER ---

  if (loading) return <Flex height="100vh" justifyContent="center" alignItems="center"><Loader size="large" /></Flex>;

  if (needsProfile) return <CreateProfileScreen user={user} onSubmit={createProfile} signOut={signOut} />;

  return (
    <Flex direction="column" minHeight="100vh" backgroundColor="#f9fafb">
      <Flex as="header" padding="1rem 2rem" backgroundColor="white" justifyContent="space-between" alignItems="center" boxShadow="medium">
        <Heading level={4} color="#2563eb">CARTA Vendor</Heading>
        <Flex gap="1rem" alignItems="center">
          <Text fontSize="small" color="gray">{profile?.name || user.username}</Text>
          <Button size="small" onClick={signOut} variation="warning"><LogOut size={16}/> Sign Out</Button>
        </Flex>
      </Flex>

      <View padding="2rem">
        <Tabs
          defaultValue="orders"
          items={[
            {
              label: 'Incoming Orders',
              value: 'orders',
              content: <OrdersView orders={orders} refresh={() => fetchOrders(profile.id)} />
            },
            {
              label: 'My Inventory',
              value: 'inventory',
              content: <InventoryView inventory={inventory} refresh={fetchInventory} />
            }
          ]}
        />
      </View>
    </Flex>
  );
}

// ==========================================
// 5. SUB-COMPONENTS
// ==========================================

function OrdersView({ orders, refresh }) {
  const updateStatus = async (id, status) => {
    try {
      const headers = await getAuthHeaders();
      const restOp = put({
        apiName: 'DeliveryApi',
        path: `/orders/${id}/status`,
        options: { body: { status }, headers }
      });
      await restOp.response;
      refresh();
    } catch (e) { alert("Failed to update status"); }
  };

  return (
    <Card marginTop="1rem">
      <Flex justifyContent="space-between" marginBottom="1rem">
        <Heading level={5}>Active Orders</Heading>
        <Button size="small" onClick={refresh}><RefreshCw size={16}/></Button>
      </Flex>
      {orders.length === 0 ? <Text>No orders found.</Text> : (
        <View as="div" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', textAlign: 'left' }}>
          <thead style={{ background: '#f3f4f6' }}>
            <tr><th style={{padding:8}}>ID</th><th style={{padding:8}}>Total</th><th style={{padding:8}}>Status</th><th style={{padding:8}}>Action</th></tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{padding:8}}>#{o.id}</td>
                <td style={{padding:8}}>${o.total_amount}</td>
                <td style={{padding:8}}>{o.status}</td>
                <td style={{padding:8}}>
                  <SelectField labelHidden size="small" value={o.status} onChange={e => updateStatus(o.id, e.target.value)}>
                    <option value="pending">Pending</option>
                    <option value="preparing">Preparing</option>
                    <option value="ready_for_pickup">Ready</option>
                    <option value="delivered">Delivered</option>
                  </SelectField>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </View>
      )}
    </Card>
  );
}

function InventoryView({ inventory, refresh }) {
  const [isAdding, setIsAdding] = useState(false);
  
  const saveProduct = async (data, id = null) => {
    const path = id ? `/users/me/products/${id}` : '/users/me/products';
    const method = id ? put : post;
    try {
      const headers = await getAuthHeaders();
      const op = method({ 
        apiName: 'DeliveryApi', 
        path, 
        options: { 
          body: { ...data, price: parseFloat(data.price), quantity_in_stock: parseInt(data.quantity_in_stock) },
          headers 
        } 
      });
      await op.response;
      setIsAdding(false);
      refresh();
    } catch(e) { alert("Error saving product"); }
  };

  return (
    <Card marginTop="1rem">
      <Flex justifyContent="space-between" marginBottom="1rem">
        <Heading level={5}>My Products</Heading>
        <Flex>
          <Button size="small" onClick={refresh}><RefreshCw size={16}/></Button>
          <Button size="small" variation="primary" onClick={() => setIsAdding(!isAdding)}>
            {isAdding ? <X size={16}/> : <Plus size={16}/>} Add
          </Button>
        </Flex>
      </Flex>

      {isAdding && <ProductForm onSave={saveProduct} />}

      <View as="div" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', textAlign: 'left' }}>
        <thead style={{ background: '#f3f4f6' }}>
          <tr><th style={{padding:8}}>Name</th><th style={{padding:8}}>SKU</th><th style={{padding:8}}>Price</th><th style={{padding:8}}>Stock</th></tr>
        </thead>
        <tbody>
          {inventory.map(p => (
            <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{padding:8}}>{p.name}</td>
              <td style={{padding:8}}>{p.sku}</td>
              <td style={{padding:8}}>${p.price}</td>
              <td style={{padding:8}}>{p.quantity_in_stock}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </View>
    </Card>
  );
}

const CreateProfileScreen = ({ user, onSubmit, signOut }) => {
  const [data, setData] = useState({ name: user.username || '', phone_number: '', default_delivery_address: '' });
  return (
    <Flex justifyContent="center" alignItems="center" minHeight="100vh" backgroundColor="#f3f4f6">
      <Card width="100%" maxWidth="500px">
        <Heading level={3} marginBottom="1rem">Finish Registration</Heading>
        <Flex direction="column" gap="1rem" as="form" onSubmit={e => { e.preventDefault(); onSubmit(data); }}>
          <TextField label="Store Name (Must contain 'Vendor')" required value={data.name} onChange={e => setData({...data, name: e.target.value})} />
          <TextField label="Phone" required value={data.phone_number} onChange={e => setData({...data, phone_number: e.target.value})} />
          <TextField label="Address" required value={data.default_delivery_address} onChange={e => setData({...data, default_delivery_address: e.target.value})} />
          <Button type="submit" variation="primary">Create Profile</Button>
        </Flex>
        <Button variation="link" onClick={signOut} marginTop="1rem">Sign Out</Button>
      </Card>
    </Flex>
  );
};

const ProductForm = ({ onSave }) => {
  const [data, setData] = useState({ name: '', sku: '', price: '', quantity_in_stock: '' });
  return (
    <Card variation="outlined" marginBottom="1rem">
      <Flex direction="column" gap="1rem" as="form" onSubmit={e => { e.preventDefault(); onSave(data); }}>
        <TextField label="Name" required onChange={e => setData({...data, name: e.target.value})} />
        <TextField label="SKU" required onChange={e => setData({...data, sku: e.target.value})} />
        <Flex gap="1rem">
          <TextField label="Price" type="number" step="0.01" required onChange={e => setData({...data, price: e.target.value})} />
          <TextField label="Stock" type="number" required onChange={e => setData({...data, quantity_in_stock: e.target.value})} />
        </Flex>
        <Button type="submit" variation="primary">Save</Button>
      </Flex>
    </Card>
  );
};

export default App;