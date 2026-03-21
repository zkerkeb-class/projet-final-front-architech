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
import UserCard from '../components/UserCard';
import {
  getOrCreateIdentity,
  getBalance,
  createGenesis,
  preparePayment,
} from '../services/utxo';

type TransactionStatus = 'idle' | 'connected' | 'waiting' | 'done';

export default function VendorScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [status, setStatus] = useState('Ready to scan for buyers');
  const [txStatus, setTxStatus] = useState<TransactionStatus>('idle');
  const [amountModalVisible, setAmountModalVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const [utxoBalance, setUtxoBalance] = useState(0);
  const [myPub, setMyPub] = useState('');
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    const init = async () => {
      const pub = await getOrCreateIdentity();
      setMyPub(pub);
      const bal = await getBalance(pub);
      setUtxoBalance(bal);

      // Si pas de fragments, créer un genesis depuis account_money
      if (bal === 0 && user?.account_money && user.account_money > 0) {
        await createGenesis(user.account_money, pub);
        setUtxoBalance(user.account_money);
      }
    };
    init();

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

        subscriptionRef.current = device.onDataReceived((data: any) => {
          handleBuyerResponse(data.data.trim());
        });
      }
    } catch (err: any) {
      setStatus(`Connection failed: ${err.message}`);
    }
  };

  const handleBuyerResponse = (message: string) => {
    if (message === 'ACCEPTED') {
      setTxStatus('done');
      setStatus(`Connected to ${connectedDevice?.name}! Enter amount to charge.`);
      // Refresh UTXO balance
      getBalance(myPub).then(setUtxoBalance);
      Alert.alert('✅ Transaction accepted!', `${amount} € transférés avec succès.`);
      setTxStatus('connected');
    } else if (message === 'REFUSED') {
      setTxStatus('connected');
      Alert.alert('❌ Cancelled', 'Your client refused the transaction.');
    } else if (message === 'INSUFFICIENT') {
      setTxStatus('connected');
      Alert.alert('❌ Insufficient', 'Your client cannot cover this amount.');
    } else if (message === 'DOUBLE_SPEND') {
      setTxStatus('connected');
      Alert.alert('⚠️ Double spend', 'Fragment already used — transaction rejected.');
    }
  };

  const sendPaymentRequest = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Erreur', 'Please enter a valid amount');
      return;
    }
    if (!connectedDevice) return;

    // Préparer le fragment UTXO
    const result = await preparePayment(myPub, `buyer_${connectedDevice.address}`, parsedAmount);
    if (!result) {
      Alert.alert('Solde insuffisant', `Vous avez ${utxoBalance} € de fragments disponibles.`);
      return;
    }

    try {
      // Envoyer le fragment JSON via BLE
      const payload = `FRAGMENT:${JSON.stringify(result.fragmentToSend)}\n`;
      await connectedDevice.write(payload);
      setAmountModalVisible(false);
      setTxStatus('waiting');
      setStatus('Fragment envoyé, en attente de confirmation...');

      // Mettre à jour le solde local immédiatement
      const newBal = await getBalance(myPub);
      setUtxoBalance(newBal);
    } catch (err: any) {
      setStatus(`Sending error: ${err.message}`);
    }
  };

  return (
    <View style={styles.container}>
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

      {/* Compte en ligne — recharge */}
      <UserCard compact={true} />

      {/* UTXO Balance */}
      <View style={styles.utxoCard}>
        <Text style={styles.utxoLabel}>💎 Solde UTXO (offline)</Text>
        <Text style={styles.utxoAmount}>{utxoBalance.toFixed(2)} €</Text>
      </View>

      {txStatus === 'idle' && (
        <TouchableOpacity style={styles.button} onPress={startScan}>
          <Text style={styles.buttonText}>🔍 Scan for Buyers</Text>
        </TouchableOpacity>
      )}

      {txStatus === 'idle' && (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.address}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.deviceItem, connectedDevice?.address === item.address && styles.connectedDevice]}
              onPress={() => connectToDevice(item)}
            >
              <Text style={styles.deviceName}>{item.name || 'Unknown'}</Text>
              <Text style={styles.deviceId}>{item.address}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No devices found yet...</Text>}
        />
      )}

      {txStatus === 'connected' && (
        <TouchableOpacity
          style={[styles.button, styles.chargeButton]}
          onPress={() => setAmountModalVisible(true)}
        >
          <Text style={styles.buttonText}>💶 Enter the amount</Text>
        </TouchableOpacity>
      )}

      {txStatus === 'waiting' && (
        <View style={styles.waitingContainer}>
          <Text style={styles.waitingText}>⏳ Waiting for buyer confirmation...</Text>
        </View>
      )}

      <Modal visible={amountModalVisible} transparent animationType="slide">
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
            <Text style={styles.modalCurrency}>€ — Solde dispo : {utxoBalance.toFixed(2)} €</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setAmountModalVisible(false)}>
                <Text style={styles.modalButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={sendPaymentRequest}>
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
  utxoCard: {
    backgroundColor: '#1e293b', borderRadius: 12, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: '#10b981',
  },
  utxoLabel: { color: '#94a3b8', fontSize: 13 },
  utxoAmount: { color: '#10b981', fontSize: 22, fontWeight: 'bold' },
  button: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 16 },
  chargeButton: { backgroundColor: '#10b981' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  deviceItem: { backgroundColor: '#1e293b', padding: 14, borderRadius: 8, marginBottom: 8 },
  connectedDevice: { borderWidth: 2, borderColor: '#10b981' },
  deviceName: { color: '#f1f5f9', fontSize: 16 },
  deviceId: { color: '#64748b', fontSize: 11 },
  empty: { color: '#475569', textAlign: 'center', marginTop: 20 },
  waitingContainer: { backgroundColor: '#1e293b', padding: 20, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  waitingText: { color: '#94a3b8', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 32, alignItems: 'center' },
  modalTitle: { color: '#f8fafc', fontSize: 20, fontWeight: 'bold', marginBottom: 24 },
  modalInput: { backgroundColor: '#0f172a', color: '#f8fafc', fontSize: 48, fontWeight: 'bold', textAlign: 'center', borderRadius: 12, padding: 16, width: '100%', marginBottom: 8 },
  modalCurrency: { color: '#94a3b8', fontSize: 13, marginBottom: 32 },
  modalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  modalButton: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  cancelButton: { backgroundColor: '#334155' },
  confirmButton: { backgroundColor: '#10b981' },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
