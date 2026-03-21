import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, Alert, Modal
} from 'react-native';
import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { useRouter } from 'expo-router';
import { useUser } from '../context/UserContext';
import UserCard from '../components/UserCard';
import { updateAccountMoney, getUserById } from '../services/api';
import { getOrCreateIdentity, getBalance, receiveFragment, Fragment } from '../services/utxo';

export default function BuyerScreen() {
  const router = useRouter();
  const { user, setUser } = useUser();
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Ready to wait for a vendor');
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingAmount, setPendingAmount] = useState<number>(0);
  const [pendingFragment, setPendingFragment] = useState<Fragment | null>(null);
  const subscriptionRef = useRef<any>(null);
  const [utxoBalance, setUtxoBalance] = useState(0);
  const myPubRef = useRef('');
  const initDoneRef = useRef(false);

  // Init UTXO — dépend de user
  useEffect(() => {
    if (!user || initDoneRef.current) return;
    initDoneRef.current = true;

    const initUTXO = async () => {
      const pub = await getOrCreateIdentity();
      myPubRef.current = pub;
      const bal = await getBalance(pub);
      setUtxoBalance(bal);
    };
    initUTXO();

    return () => stopListening();
  }, [user]);

  const startListening = async () => {
    try {
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      if (!enabled) await RNBluetoothClassic.requestBluetoothEnabled();

      setIsListening(true);
      setStatus('📡 Waiting for vendor connection...');

      const device = await RNBluetoothClassic.accept({ delimiter: '\n' });
      if (device) {
        setConnectedDevice(device);
        setStatus(`Connected to ${device.name}! Waiting for payment request...`);
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
        const fragment: Fragment = JSON.parse(message.replace('FRAGMENT:', ''));
        setPendingFragment(fragment);
        setPendingAmount(fragment.value);
        setStatus(`💶 Incoming transaction: ${fragment.value} €`);
        setTimeout(() => checkAndProcessPayment(fragment.value, device), 2000);
      } catch {
        setStatus('⚠️ Received malformed fragment');
        device.write('REFUSED\n');
      }
      return;
    }

    if (message.startsWith('AMOUNT:')) {
      const amount = parseFloat(message.replace('AMOUNT:', ''));
      setPendingAmount(amount);
      setPendingFragment(null);
      setStatus(`💶 Incoming transaction: ${amount} €`);
      setTimeout(() => checkAndProcessPayment(amount, device), 2000);
    }
  };

  const checkAndProcessPayment = (amount: number, device: BluetoothDevice) => {
    const currentBalance = user!.account_money;
    if (currentBalance < amount) {
      device.write('INSUFFICIENT\n');
      Alert.alert(
        '❌ Insufficient Balance',
        `You currently have ${currentBalance} € but the transaction's amount is ${amount} €`
      );
      setStatus('📡 Waiting for vendor connection...');
    } else {
      setConfirmModalVisible(true);
    }
  };

  const handleAccept = async () => {
    setConfirmModalVisible(false);
    try {
      await connectedDevice?.write('ACCEPTED\n');

      // UTXO — stocker le fragment avec notre propre pub
      if (pendingFragment) {
        const fragmentWithMyPub = { ...pendingFragment, ownerPub: myPubRef.current };
        const accepted = await receiveFragment(fragmentWithMyPub);
        if (!accepted) {
          Alert.alert('⚠️ Double spend', 'Ce fragment a déjà été utilisé.');
        } else {
          const newBal = await getBalance(myPubRef.current);
          setUtxoBalance(newBal);
        }
      }

      // Online sync — silencieux si pas de réseau
      try {
        await updateAccountMoney(user!.id, -pendingAmount);
        const updatedUser = await getUserById(user!.id);
        setUser(updatedUser);
      } catch {}

      setStatus('📡 Waiting for vendor connection...');
      Alert.alert('✅ Transaction accepted!', `${pendingAmount} € received. UTXO balance updated.`);
      setPendingFragment(null);
    } catch (err: any) {
      Alert.alert('Erreur', err.message);
    }
  };

  const handleRefuse = async () => {
    setConfirmModalVisible(false);
    await connectedDevice?.write('REFUSED\n');
    setPendingFragment(null);
    setStatus('📡 Waiting for vendor connection...');
    Alert.alert('❌ Cancelled Transaction', 'You refused the transaction.');
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

      <UserCard compact={true} />

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

      <Modal visible={confirmModalVisible} transparent animationType="slide" onRequestClose={() => handleRefuse()}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>💶 Validate transaction</Text>

            <View style={styles.amountContainer}>
              <Text style={styles.amountLabel}>Amount</Text>
              <Text style={styles.amountValue}>{pendingAmount} €</Text>
            </View>

            <View style={styles.balanceContainer}>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Current online balance</Text>
                <Text style={styles.balanceValue}>{user?.account_money} €</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Current UTXO balance</Text>
                <Text style={[styles.balanceValue, { color: '#8b5cf6' }]}>{utxoBalance.toFixed(2)} €</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>UTXO after receipt</Text>
                <Text style={[styles.balanceValue, { color: '#10b981' }]}>
                  {(utxoBalance + pendingAmount).toFixed(2)} €
                </Text>
              </View>
              {pendingFragment && (
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceLabel}>Fragment ID</Text>
                  <Text style={[styles.balanceValue, { fontSize: 10, color: '#475569' }]}>
                    {pendingFragment.id.slice(0, 16)}...
                  </Text>
                </View>
              )}
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
  button: { backgroundColor: '#3b82f6', padding: 14, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
  peripheralButton: { backgroundColor: '#8b5cf6' },
  stopButton: { backgroundColor: '#ef4444' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  utxoCard: {
    backgroundColor: '#1e293b', borderRadius: 12, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 12,
    borderWidth: 1, borderColor: '#8b5cf6',
  },
  utxoLabel: { color: '#94a3b8', fontSize: 13 },
  utxoAmount: { color: '#8b5cf6', fontSize: 20, fontWeight: 'bold' },
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
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  refuseButton: { backgroundColor: '#ef4444' },
  acceptButton: { backgroundColor: '#10b981' },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
