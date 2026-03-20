import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, Platform, Alert, PermissionsAndroid,
  TextInput, Modal
} from 'react-native';
import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { useRouter } from 'expo-router';
import { useUser } from '../context/UserContext';
import UserCard from '../components/UserCard';
import { updateAccountMoney } from '../services/api';

type TransactionStatus = 'idle' | 'connected' | 'entering_amount' | 'waiting' | 'done';

export default function VendorScreen() {
  const router = useRouter();
  const { user, setUser } = useUser();
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [status, setStatus] = useState('Ready to scan for buyers');
  const [txStatus, setTxStatus] = useState<TransactionStatus>('idle');
  const [amountModalVisible, setAmountModalVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (connectedDevice) connectedDevice.disconnect();
      if (subscriptionRef.current) subscriptionRef.current.remove();
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
        setTxStatus('connected');
        setStatus(`Connected to ${device.name}! Enter amount to charge.`);

        // Listen for buyer responses
        subscriptionRef.current = device.onDataReceived((data: any) => {
          const message = data.data.trim();
          handleBuyerResponse(message);
        });
      }
    } catch (err: any) {
      setStatus(`Connection failed: ${err.message}`);
    }
  };

  const handleBuyerResponse = (message: string) => {
    if (message === 'ACCEPTED') {
      const parsedAmount = parseFloat(amount);
      // Add money to vendor's account
      updateAccountMoney(user!.id, parsedAmount)
        .then(async () => {
          const { getUserById } = await import('../services/api');
          const updatedUser = await getUserById(user!.id);
          setUser(updatedUser);
        })
        .catch(err => console.error(err));

      setTxStatus('done');
      setStatus(`Connected to ${connectedDevice?.name}! Enter amount to charge.`);
      Alert.alert('✅ Transaction accepted !', `Your client has payed you ${amount} €`);

    } else if (message === 'REFUSED') {
      setTxStatus('connected');
      setStatus(`Connected to ${connectedDevice?.name}! Enter amount to charge.`);
      Alert.alert('❌ Cancelled transaction', 'Your client has cancelled the transaction.');

    } else if (message === 'INSUFFICIENT') {
      setTxStatus('connected');
      setStatus(`Connected to ${connectedDevice?.name}! Enter amount to charge.`);
      Alert.alert('❌ Insufficient', 'Your client cannot do this transaction.');
    }
  };

  const sendAmount = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Erreur', 'Please, enter a valid amount');
      return;
    }
    if (!connectedDevice) return;

    try {
      await connectedDevice.write(`AMOUNT:${parsedAmount}\n`);
      setAmountModalVisible(false);
      setTxStatus('waiting');
    } catch (err: any) {
      setStatus(`Sending error: ${err.message}`);
    }
  };

  return (
    <View style={styles.container}>
      {/* Username top right */}
      {user && (
        <View style={styles.header}>
          <Text style={styles.username}>👤 {user.username}</Text>
        </View>
      )}

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>🏪 Vendor Mode</Text>
      <Text style={styles.status}>Status: {status}</Text>

      <UserCard compact={true} />

      {/* Scan button — only before connection */}
      {txStatus === 'idle' && (
        <TouchableOpacity style={styles.button} onPress={startScan}>
          <Text style={styles.buttonText}>🔍 Scan for Buyers</Text>
        </TouchableOpacity>
      )}

      {/* Device list — only before connection */}
      {txStatus === 'idle' && (
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
      )}

      {/* Enter amount button — only after connection */}
      {txStatus === 'connected' && (
        <TouchableOpacity
          style={[styles.button, styles.chargeButton]}
          onPress={() => setAmountModalVisible(true)}
        >
          <Text style={styles.buttonText}>💶 Enter the amount</Text>
        </TouchableOpacity>
      )}

      {/* Waiting indicator */}
      {txStatus === 'waiting' && (
        <View style={styles.waitingContainer}>
          <Text style={styles.waitingText}>⏳ Waiting for buyer...</Text>
        </View>
      )}

      {/* Amount modal */}
      <Modal
        visible={amountModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAmountModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>💶 Billing amount</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="0.00"
              placeholderTextColor="#475569"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />
            <Text style={styles.modalCurrency}>€</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setAmountModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={sendAmount}
              >
                <Text style={styles.modalButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0f172a' },
  header: { position: 'absolute', top: 48, right: 24 },
  username: { color: '#94a3b8', fontSize: 14, fontWeight: '600' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8, marginTop: 16 },
  status: { fontSize: 14, color: '#94a3b8', marginBottom: 16 },
  back: { color: '#3b82f6', fontSize: 16, marginBottom: 8 },
  button: {
    backgroundColor: '#3b82f6', padding: 14,
    borderRadius: 10, alignItems: 'center', marginBottom: 16
  },
  chargeButton: { backgroundColor: '#10b981' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  deviceItem: {
    backgroundColor: '#1e293b', padding: 14,
    borderRadius: 8, marginBottom: 8
  },
  connectedDevice: { borderWidth: 2, borderColor: '#10b981' },
  deviceName: { color: '#f1f5f9', fontSize: 16 },
  deviceId: { color: '#64748b', fontSize: 11 },
  empty: { color: '#475569', textAlign: 'center', marginTop: 20 },
  waitingContainer: {
    backgroundColor: '#1e293b', padding: 20,
    borderRadius: 12, alignItems: 'center', marginTop: 16
  },
  waitingText: { color: '#94a3b8', fontSize: 16 },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#1e293b', borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 32, alignItems: 'center'
  },
  modalTitle: { color: '#f8fafc', fontSize: 20, fontWeight: 'bold', marginBottom: 24 },
  modalInput: {
    backgroundColor: '#0f172a', color: '#f8fafc', fontSize: 48,
    fontWeight: 'bold', textAlign: 'center', borderRadius: 12,
    padding: 16, width: '100%', marginBottom: 8
  },
  modalCurrency: { color: '#94a3b8', fontSize: 16, marginBottom: 32 },
  modalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  modalButton: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  cancelButton: { backgroundColor: '#334155' },
  confirmButton: { backgroundColor: '#10b981' },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});