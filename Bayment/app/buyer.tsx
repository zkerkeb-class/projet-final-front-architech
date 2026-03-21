import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, Alert, Modal
} from 'react-native';
import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { useRouter } from 'expo-router';
import { useUser } from '../context/UserContext';
import UserCard from '../components/UserCard';
import {
  getOrCreateIdentity,
  getBalance,
  receiveFragment,
  Fragment,
} from '../services/utxo';

export default function BuyerScreen() {
  const router = useRouter();
  const { user } = useUser();
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Ready to receive a payment');
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingFragment, setPendingFragment] = useState<Fragment | null>(null);
  const [utxoBalance, setUtxoBalance] = useState(0);
  const [myPub, setMyPub] = useState('');
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
    const init = async () => {
      const pub = await getOrCreateIdentity();
      setMyPub(pub);
      const bal = await getBalance(pub);
      setUtxoBalance(bal);
    };
    init();
    return () => stopListening();
  }, []);

  const startListening = async () => {
    try {
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      if (!enabled) await RNBluetoothClassic.requestBluetoothEnabled();

      setIsListening(true);
      setStatus('📡 Waiting for vendor connection...');

      const device = await RNBluetoothClassic.accept({ delimiter: '\n' });
      if (device) {
        setConnectedDevice(device);
        setStatus(`Connected to ${device.name}! Waiting for payment...`);

        subscriptionRef.current = device.onDataReceived((data: any) => {
          handleVendorMessage(data.data.trim(), device);
        });
      }
    } catch (err: any) {
      setStatus(`Failed: ${err.message}`);
      setIsListening(false);
    }
  };

  const handleVendorMessage = (message: string, device: BluetoothDevice) => {
    if (message.startsWith('FRAGMENT:')) {
      try {
        const raw = message.replace('FRAGMENT:', '');
        const fragment: Fragment = JSON.parse(raw);
        setPendingFragment(fragment);
        setStatus(`💶 Incoming payment: ${fragment.value} €`);
        setConfirmModalVisible(true);
      } catch {
        setStatus('⚠️ Received malformed fragment');
        device.write('REFUSED\n');
      }
    }
  };

  const handleAccept = async () => {
    if (!pendingFragment || !connectedDevice) return;
    setConfirmModalVisible(false);

    // Double-spend check + store fragment
    const accepted = await receiveFragment(pendingFragment);

    if (!accepted) {
      await connectedDevice.write('DOUBLE_SPEND\n');
      Alert.alert('⚠️ Double spend', 'Ce fragment a déjà été utilisé.');
      setStatus('📡 Waiting for vendor connection...');
      return;
    }

    await connectedDevice.write('ACCEPTED\n');

    // Refresh UTXO balance
    const newBal = await getBalance(myPub);
    setUtxoBalance(newBal);

    setStatus('📡 Waiting for vendor connection...');
    Alert.alert('✅ Payment received!', `+${pendingFragment.value} € ajoutés à votre wallet offline.`);
    setPendingFragment(null);
  };

  const handleRefuse = async () => {
    setConfirmModalVisible(false);
    await connectedDevice?.write('REFUSED\n');
    setPendingFragment(null);
    setStatus('📡 Waiting for vendor connection...');
    Alert.alert('❌ Refused', 'You declined the transaction.');
  };

  const stopListening = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    setIsListening(false);
    setStatus('Stopped listening');
  };

  return (
    <View style={styles.container}>
      {user && (
        <View style={styles.header}>
          <Text style={styles.username}>👤 {user.username}</Text>
        </View>
      )}

      <TouchableOpacity onPress={() => { stopListening(); router.back(); }}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>🛍️ Buyer Mode</Text>
      <Text style={styles.status}>Status: {status}</Text>

      {/* Compte en ligne — recharge */}
      <UserCard compact={true} />

      {/* UTXO Balance */}
      <View style={styles.utxoCard}>
        <Text style={styles.utxoLabel}>💎 Solde UTXO (offline)</Text>
        <Text style={styles.utxoAmount}>{utxoBalance.toFixed(2)} €</Text>
      </View>

      {!isListening ? (
        <TouchableOpacity style={[styles.button, styles.peripheralButton]} onPress={startListening}>
          <Text style={styles.buttonText}>📡 Wait for Vendor</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={stopListening}>
          <Text style={styles.buttonText}>Stop Listening</Text>
        </TouchableOpacity>
      )}

      {/* Payment confirmation modal */}
      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="slide"
        onRequestClose={handleRefuse}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>💶 Validate transaction</Text>

            <View style={styles.amountContainer}>
              <Text style={styles.amountLabel}>Amount received</Text>
              <Text style={styles.amountValue}>{pendingFragment?.value ?? 0} €</Text>
            </View>

            <View style={styles.balanceContainer}>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Current UTXO balance</Text>
                <Text style={styles.balanceValue}>{utxoBalance.toFixed(2)} €</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Balance after</Text>
                <Text style={[styles.balanceValue, styles.balanceAfter]}>
                  {(utxoBalance + (pendingFragment?.value ?? 0)).toFixed(2)} €
                </Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Fragment ID</Text>
                <Text style={[styles.balanceValue, { fontSize: 10, color: '#475569' }]}>
                  {pendingFragment?.id.slice(0, 16)}...
                </Text>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.refuseButton]} onPress={handleRefuse}>
                <Text style={styles.modalButtonText}>❌ Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.acceptButton]} onPress={handleAccept}>
                <Text style={styles.modalButtonText}>✅ Accept</Text>
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
    borderWidth: 1, borderColor: '#8b5cf6',
  },
  utxoLabel: { color: '#94a3b8', fontSize: 13 },
  utxoAmount: { color: '#8b5cf6', fontSize: 22, fontWeight: 'bold' },
  button: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 16 },
  peripheralButton: { backgroundColor: '#8b5cf6' },
  stopButton: { backgroundColor: '#ef4444' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 32 },
  modalTitle: { color: '#f8fafc', fontSize: 20, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
  amountContainer: { backgroundColor: '#0f172a', borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 16 },
  amountLabel: { color: '#94a3b8', fontSize: 14, marginBottom: 8 },
  amountValue: { color: '#f8fafc', fontSize: 48, fontWeight: 'bold' },
  balanceContainer: { backgroundColor: '#0f172a', borderRadius: 12, padding: 16, marginBottom: 24, gap: 12 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  balanceLabel: { color: '#94a3b8', fontSize: 14 },
  balanceValue: { color: '#f8fafc', fontSize: 14, fontWeight: '600' },
  balanceAfter: { color: '#10b981' },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  refuseButton: { backgroundColor: '#ef4444' },
  acceptButton: { backgroundColor: '#10b981' },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
