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

export default function BuyerScreen() {
  const router = useRouter();
  const { user, setUser } = useUser();
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Ready to wait for a vendor');
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingAmount, setPendingAmount] = useState<number>(0);
  const subscriptionRef = useRef<any>(null);

  useEffect(() => {
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
        setStatus(`Connected to ${device.name}! Waiting for payment request...`);

        subscriptionRef.current = device.onDataReceived((data: any) => {
          const message = data.data.trim();
          handleVendorMessage(message, device);
        });
      }
    } catch (err: any) {
      setStatus(`Failed: ${err.message}`);
      setIsListening(false);
    }
  };

  const handleVendorMessage = (message: string, device: BluetoothDevice) => {
    if (message.startsWith('AMOUNT:')) {
      const amount = parseFloat(message.replace('AMOUNT:', ''));
      setPendingAmount(amount);
      setStatus(`💶 Incoming transaction: ${amount} €`);

      // Wait 2 seconds then check balance
      setTimeout(() => {
        checkAndProcessPayment(amount, device);
      }, 2000);
    }
  };

  const checkAndProcessPayment = (amount: number, device: BluetoothDevice) => {
    // Use local balance — no API call
    const currentBalance = user!.account_money;

    if (currentBalance < amount) {
      // Not enough funds
      device.write('INSUFFICIENT\n');
      Alert.alert(
        '❌ Insufficient Balance',
        `You currently have ${currentBalance} € but the transaction's amount is ${amount} €`
      );
      setStatus('📡 Waiting for vendor connection...');
    } else {
      // Enough funds — show confirmation modal
      setConfirmModalVisible(true);
    }
  };

  const handleAccept = async () => {
    setConfirmModalVisible(false);
    try {
      // Deduct from buyer's account
      await updateAccountMoney(user!.id, -pendingAmount);
      const updatedUser = await getUserById(user!.id);
      setUser(updatedUser);

      // Notify vendor
      await connectedDevice?.write('ACCEPTED\n');

      setStatus('📡 Waiting for vendor connection...');
      Alert.alert('✅ Transaction accepted !', `${pendingAmount} € were debited from your account.`);
    } catch (err: any) {
      Alert.alert('Erreur', err.message);
    }
  };

  const handleRefuse = async () => {
    setConfirmModalVisible(false);
    await connectedDevice?.write('REFUSED\n');
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
      {/* Username top right */}
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

      {!isListening ? (
        <TouchableOpacity
          style={[styles.button, styles.peripheralButton]}
          onPress={startListening}
        >
          <Text style={styles.buttonText}>📡 Wait for Vendor</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.button, styles.stopButton]}
          onPress={stopListening}
        >
          <Text style={styles.buttonText}>Stop Listening</Text>
        </TouchableOpacity>
      )}

      {/* Payment confirmation modal */}
      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => handleRefuse()}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>💶 Validate transaction</Text>

            <View style={styles.amountContainer}>
              <Text style={styles.amountLabel}>Amount</Text>
              <Text style={styles.amountValue}>{pendingAmount} €</Text>
            </View>

            <View style={styles.balanceContainer}>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Current balance</Text>
                <Text style={styles.balanceValue}>{user?.account_money} €</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.balanceLabel}>Balance after payment</Text>
                <Text style={[styles.balanceValue, styles.balanceAfter]}>
                  {(user?.account_money ?? 0) - pendingAmount} €
                </Text>
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.refuseButton]}
                onPress={handleRefuse}
              >
                <Text style={styles.modalButtonText}>❌ Decline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.acceptButton]}
                onPress={handleAccept}
              >
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
  button: {
    backgroundColor: '#3b82f6', padding: 14,
    borderRadius: 10, alignItems: 'center', marginBottom: 16
  },
  peripheralButton: { backgroundColor: '#8b5cf6' },
  stopButton: { backgroundColor: '#ef4444' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#1e293b', borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 32
  },
  modalTitle: {
    color: '#f8fafc', fontSize: 20,
    fontWeight: 'bold', marginBottom: 24, textAlign: 'center'
  },
  amountContainer: {
    backgroundColor: '#0f172a', borderRadius: 12,
    padding: 20, alignItems: 'center', marginBottom: 16
  },
  amountLabel: { color: '#94a3b8', fontSize: 14, marginBottom: 8 },
  amountValue: { color: '#f8fafc', fontSize: 48, fontWeight: 'bold' },
  balanceContainer: {
    backgroundColor: '#0f172a', borderRadius: 12,
    padding: 16, marginBottom: 24, gap: 12
  },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  balanceLabel: { color: '#94a3b8', fontSize: 14 },
  balanceValue: { color: '#f8fafc', fontSize: 14, fontWeight: '600' },
  balanceAfter: { color: '#ef4444' },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  refuseButton: { backgroundColor: '#ef4444' },
  acceptButton: { backgroundColor: '#10b981' },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});