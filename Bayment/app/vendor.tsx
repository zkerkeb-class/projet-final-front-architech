import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, Platform, Alert, PermissionsAndroid,
  TextInput, ActivityIndicator
} from 'react-native';
import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { useRouter } from 'expo-router';
import { getUserById } from '../services/api';

export default function VendorScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [status, setStatus] = useState('Enter your user ID to start');

  const fetchUser = async () => {
    if (!userId) {
      Alert.alert('Error', 'Please enter your user ID');
      return;
    }
    setLoadingUser(true);
    try {
      const data = await getUserById(parseInt(userId));
      setUser(data);
      setStatus('User loaded! You can now scan for buyers.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoadingUser(false);
    }
  };

  useEffect(() => {
    return () => {
      if (connectedDevice) {
        connectedDevice.disconnect();
      }
    };
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    }
  };

  const startScan = async () => {
    if (!user) {
      Alert.alert('Error', 'Please load your user first');
      return;
    }
    await requestPermissions();
    setDevices([]);
    setStatus('Scanning...');
    try {
      const paired = await RNBluetoothClassic.getBondedDevices();
      setDevices(paired);
      const unpaired = await RNBluetoothClassic.startDiscovery();
      setDevices(prev => [...prev, ...unpaired]);
      setStatus('Scan complete — tap a device to connect');
    } catch (err: any) {
      setStatus(`Scan failed: ${err.message}`);
    }
  };

  const connectToDevice = async (device: BluetoothDevice) => {
    setStatus('Connecting...');
    try {
      const connected = await device.connect({
        connectorType: 'rfcomm',
        DELIMITER: '\n',
        DEVICE_CHARSET: Platform.OS === 'ios' ? 1536 : 'utf-8',
      });
      if (connected) {
        setConnectedDevice(device);
        setStatus(`Connected to ${device.name}!`);
      }
    } catch (err: any) {
      setStatus(`Connection failed: ${err.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>🏪 Vendor Mode</Text>
      <Text style={styles.status}>Status: {status}</Text>

      {/* User ID input */}
      {!user ? (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter your user ID"
            placeholderTextColor="#475569"
            keyboardType="numeric"
            value={userId}
            onChangeText={setUserId}
          />
          <TouchableOpacity
            style={styles.button}
            onPress={fetchUser}
            disabled={loadingUser}
          >
            {loadingUser
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Load My Account</Text>
            }
          </TouchableOpacity>
        </View>
      ) : (
        // User balance card
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>👤 {user.username}</Text>
          <Text style={styles.balanceLabel}>💰 My Balance:</Text>
          <Text style={styles.balanceAmount}>{user.account_money} €</Text>
        </View>
      )}

      {/* Scan button */}
      {user && (
        <TouchableOpacity style={styles.button} onPress={startScan}>
          <Text style={styles.buttonText}>🔍 Scan for Buyers</Text>
        </TouchableOpacity>
      )}

      {/* Device list */}
      <FlatList
        data={devices}
        keyExtractor={(item) => item.address}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.deviceItem,
              connectedDevice?.address === item.address && styles.connectedDevice
            ]}
            onPress={() => connectToDevice(item)}
          >
            <Text style={styles.deviceName}>{item.name || 'Unknown'}</Text>
            <Text style={styles.deviceId}>{item.address}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No devices found yet...</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0f172a' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8, marginTop: 16 },
  status: { fontSize: 14, color: '#94a3b8', marginBottom: 16 },
  back: { color: '#3b82f6', fontSize: 16, marginBottom: 8 },
  inputContainer: { marginBottom: 16 },
  input: {
    backgroundColor: '#1e293b', color: '#f1f5f9',
    padding: 14, borderRadius: 10, fontSize: 16, marginBottom: 12
  },
  button: {
    backgroundColor: '#3b82f6', padding: 14,
    borderRadius: 10, alignItems: 'center', marginBottom: 16
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  balanceCard: {
    backgroundColor: '#1e293b', padding: 20,
    borderRadius: 10, marginBottom: 16, alignItems: 'center'
  },
  balanceLabel: { color: '#94a3b8', fontSize: 14, marginBottom: 4 },
  balanceAmount: { color: '#10b981', fontSize: 36, fontWeight: 'bold' },
  deviceItem: {
    backgroundColor: '#1e293b', padding: 14,
    borderRadius: 8, marginBottom: 8
  },
  connectedDevice: { borderWidth: 2, borderColor: '#10b981' },
  deviceName: { color: '#f1f5f9', fontSize: 16 },
  deviceId: { color: '#64748b', fontSize: 11 },
  empty: { color: '#475569', textAlign: 'center', marginTop: 20 },
});