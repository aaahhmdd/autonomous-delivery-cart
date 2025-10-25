export enum RootRoutes {
    AuthStack = 'AuthStack',
    MainTabs = 'MainTabs'
}

export enum AuthRoutes {
    Login = 'Login',
    SignUp = 'SignUp'
}

export enum MainRoutes {
    Home = 'Home',
    Offers = 'Offers',
    EatClub = 'EatClub',
    Account = 'Account',
    RestaurantDetails = 'RestaurantDetails',
    Menu = 'Menu',
    ProfileEdit = 'ProfileEdit',
    Cart = 'Cart',
    Confirmation = 'Confirmation',
    EditInfo = 'EditInfo'
}


export type RootStackParamList = {
    [RootRoutes.AuthStack]: undefined;
    [RootRoutes.MainTabs]: undefined;
}

export type AuthStackParamList = {
    [AuthRoutes.Login]: undefined;
    [AuthRoutes.SignUp]: undefined;
}

export type MainTabParamList = {








}






