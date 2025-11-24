
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { NavigationContainer } from "@react-navigation/native";
import Signup from "./screens/Signup";
import VerifyEmail from "./screens/VerifyEmail";
import Login from "./screens/Login";
import Home from "./screens/Home";
import '../global.css';

const Stack = createNativeStackNavigator();

function App() {
    return (
        <NavigationContainer>
        <Stack.Navigator screenOptions={{headerShown:false}}>
            <Stack.Screen name={"SIGNUP"} component={Signup}/>
            <Stack.Screen name={"VERIFYEMAIL"} component={VerifyEmail}/>
            <Stack.Screen name={"LOGIN"} component={Login}/>
            <Stack.Screen name={"HOME"} component={Home}/>
        </Stack.Navigator>
        </NavigationContainer>
    );
}

export default App;




