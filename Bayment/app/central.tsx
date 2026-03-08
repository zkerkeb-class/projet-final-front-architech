import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, Platform, Alert, PermissionsAndroid
} from 'react-native';
import BleManager, {
  Peripheral,
  BleDisconnectPeripheralEvent,
  BleManagerDidUpdateValueForCharacteristicEvent
} from 'react-native-ble-manager';
import { NativeEventEmitter, NativeModules } from 'react-native';
import { request, PERMISSIONS } from 'react-native-permissions';
import { useRouter } from 'expo-router';

const BleManagerEmitter = new NativeEventEmitter(NativeModules.BleManager);
const SERVICE_UUID = '12345678-1234-1234-1234-123456789012';
const CHARACTERISTIC_UUID = 'abcdefab-cdef-abcd-efab-cdefabcdefab';

export default function CentralScreen() {
  const router = useRouter();
  const [devices, setDevices] = useState<Peripheral[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [status, setStatus] = useState('Idle');

  useEffect(() => {
    BleManager.start({ showAlert: false });

    const discoverSub = BleManagerEmitter.addListener(
      'BleManagerDiscoverPeripheral',
      (peripheral: Peripheral) => {
        setDevices((prev: Peripheral[]) => {
          const exists = prev.find(d => d.id === peripheral.id);
          if (!exists && peripheral.name) {
            return [...prev, peripheral];
          }
          return prev;
        });
      }
    );

    const connectSub = BleManagerEmitter.addListener(
      'BleManagerConnectPeripheral',
      (peripheral: { peripheral: string }) => {
        setStatus(`Connected to: ${peripheral.peripheral}`);
      }
    );

    const disconnectSub = BleManagerEmitter.addListener(
      'BleManagerDisconnectPeripheral',
      (_peripheral: BleDisconnectPeripheralEvent) => {
        setConnectedDevice(null);
        setStatus('Disconnected');
      }
    );

    return () => {
      discoverSub.remove();
      connectSub.remove();
      disconnectSub.remove();
    };
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    } else {
      await request(PERMISSIONS.IOS.BLUETOOTH);
    }
  };

  const startScan = async () => {
    await requestPermissions();
    setDevices([]);
    setStatus('Scanning...');
    BleManager.scan()
      .then(() => setStatus('Scan complete — tap a device to connect'))
      .catch(() => setStatus('Scan failed'));
  };

  const connectToDevice = (peripheralId: string) => {
    setStatus('Connecting...');
    BleManager.connect(peripheralId)
      .then(() => {
        setConnectedDevice(peripheralId);
        setStatus('Connected! Ready to send.');
        return BleManager.startNotification(
          peripheralId, SERVICE_UUID, CHARACTERISTIC_UUID
        );
      })
      .catch((err: Error) => {
        setStatus(`Connection failed: ${err.message}`);
      });
  };

  const sendHelloWorld = () => {
    if (!connectedDevice) {
      Alert.alert('Not connected', 'Please connect to a device first.');
      return;
    }
    const message = 'Hello World';
    const bytes = message.split('').map(c => c.charCodeAt(0));
    BleManager.write(connectedDevice, SERVICE_UUID, CHARACTERISTIC_UUID, bytes)
      .then(() => setStatus('Sent: Hello World ✅'))
      .catch((err: Error) => setStatus(`Send failed: ${err.message}`));
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>📤 Send Mode</Text>
      <Text style={styles.status}>Status: {status}</Text>

      <TouchableOpacity style={styles.button} onPress={startScan}>
        <Text style={styles.buttonText}>🔍 Scan for Devices</Text>
      </TouchableOpacity>

      <FlatList
        data={devices}
        keyExtractor={(item: Peripheral) => item.id}
        renderItem={({ item }: { item: Peripheral }) => (
          <TouchableOpacity
            style={[
              styles.deviceItem,
              connectedDevice === item.id && styles.connectedDevice
            ]}
            onPress={() => connectToDevice(item.id)}
          >
            <Text style={styles.deviceName}>{item.name || 'Unknown'}</Text>
            <Text style={styles.deviceId}>{item.id}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>No devices found yet...</Text>
        }
      />

      <TouchableOpacity
        style={[styles.button, styles.sendButton]}
        onPress={sendHelloWorld}
      >
        <Text style={styles.buttonText}>📤 Send "Hello World"</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0f172a' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8, marginTop: 16 },
  status: { fontSize: 14, color: '#94a3b8', marginBottom: 16 },
  back: { color: '#3b82f6', fontSize: 16, marginBottom: 8 },
  button: {
    backgroundColor: '#3b82f6', padding: 14,
    borderRadius: 10, alignItems: 'center', marginBottom: 16
  },
  sendButton: { backgroundColor: '#10b981', marginTop: 'auto' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  deviceItem: {
    backgroundColor: '#1e293b', padding: 14,
    borderRadius: 8, marginBottom: 8
  },
  connectedDevice: { borderWidth: 2, borderColor: '#10b981' },
  deviceName: { color: '#f1f5f9', fontSize: 16 },
  deviceId: { color: '#64748b', fontSize: 11 },
  empty: { color: '#475569', textAlign: 'center', marginTop: 20 },
});