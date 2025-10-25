import { View, StyleSheet, Text } from 'react-native';
import '../../global.css';


function Home() {

    return (
        <View style={styles.container}>
        <View style={{ marginVertical: 30 }}></View>
        <Text style={styles.titleText}> Welcome to Carta App!!! </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {flexDirection:'column', marginBottom:20, alignItems:'center'},
    titleText: {fontSize:30, color: '#222222', fontWeight: 'bold'},
    inputBox: {width: 288, height:48, color:'#000000', borderColor:'#666666', borderWidth:2.2, borderRadius:20, paddingHorizontal:16, fontWeight:'500',},
    submitButton: {backgroundColor:'#222222', paddingVertical:12, paddingHorizontal:24, borderRadius:10, height:50, justifyContent:'center', alignItems:'center',},
    submitButtonText: {color:'#FFFFFF', fontSize:18, fontWeight:'bold',},
});


export default Home;







