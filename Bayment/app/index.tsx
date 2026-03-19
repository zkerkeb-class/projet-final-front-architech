import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();
  const requestPermissions = async () => {
  if (Platform.OS === 'android') {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      const allGranted = Object.values(result).every(
        status => status === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        Alert.alert(
          '⚠️ Permissions Required',
          'Please grant all Bluetooth permissions in your phone settings to use this app.',
          [{ text: 'OK' }]
        );
      }
    } else {
      const result = await request(PERMISSIONS.IOS.BLUETOOTH);
      if (result !== 'granted') {
        Alert.alert(
          '⚠️ Bluetooth Permission Required',
          'Please enable Bluetooth permission for Bayment in Settings → Bayment → Bluetooth',
          [{ text: 'OK' }]
        );
      }
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📶 Bluetooth Messenger</Text>
      <Text style={styles.subtitle}>Choose your role:</Text>

      <TouchableOpacity
        style={[styles.button, styles.peripheralButton]}
        onPress={() => router.push('/buyer')}
      >
        <Text style={styles.buttonText}>📡 Buyer Mode</Text>
        <Text style={styles.buttonSubtext}>Search for transaction</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.centralButton]}
        onPress={() => router.push('/vendor')}
      >
        <Text style={styles.buttonText}>📤  Vendor Mode</Text>
        <Text style={styles.buttonSubtext}>Scan, connect & send "Hello World"</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0f172a' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8, marginTop: 16 },
  subtitle: { fontSize: 16, color: '#94a3b8', marginBottom: 32 },
  button: {
    padding: 14, borderRadius: 10,
    alignItems: 'center', marginBottom: 16
  },
  peripheralButton: { backgroundColor: '#8b5cf6' },
  centralButton: { backgroundColor: '#3b82f6' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSubtext: { color: '#e2e8f0', fontSize: 12, marginTop: 4 },
});