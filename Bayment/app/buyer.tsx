import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, Alert, TextInput, ActivityIndicator
} from 'react-native';
import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { useRouter } from 'expo-router';
import { getUserById } from '../services/api';

export default function BuyerScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Enter your user ID to start');
  const subscriptionRef = useRef<any>(null);

  const fetchUser = async () => {
    if (!userId) {
      Alert.alert('Error', 'Please enter your user ID');
      return;
    }
    setLoadingUser(true);
    try {
      const data = await getUserById(parseInt(userId));
      setUser(data);
      setStatus('User loaded! You can now wait for a vendor.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoadingUser(false);
    }
  };

  useEffect(() => {
    return () => stopListening();
  }, []);

  const startListening = async () => {
    if (!user) {
      Alert.alert('Error', 'Please load your user first');
      return;
    }
    try {
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      if (!enabled) await RNBluetoothClassic.requestBluetoothEnabled();

      setIsListening(true);
      setStatus('📡 Waiting for vendor connection...');

      const device = await RNBluetoothClassic.accept({ delimiter: '\n' });
      if (device) {
        setStatus(`Connected to ${device.name}!`);
        const dataSubscription = device.onDataReceived((data: any) => {
          const message = data.data.trim();
          Alert.alert('📨 Message Received!', message);
          setStatus(`Received: ${message}`);
        });
        subscriptionRef.current = dataSubscription;
      }
    } catch (err: any) {
      setStatus(`Failed: ${err.message}`);
      setIsListening(false);
    }
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
      <TouchableOpacity onPress={() => { stopListening(); router.back(); }}>
        <Text style={styles.back}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>🛍️ Buyer Mode</Text>
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

      {/* Listen button */}
      {user && (
        !isListening ? (
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
        )
      )}
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
  peripheralButton: { backgroundColor: '#8b5cf6' },
  stopButton: { backgroundColor: '#ef4444' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  balanceCard: {
    backgroundColor: '#1e293b', padding: 20,
    borderRadius: 10, marginBottom: 16, alignItems: 'center'
  },
  balanceLabel: { color: '#94a3b8', fontSize: 14, marginBottom: 4 },
  balanceAmount: { color: '#10b981', fontSize: 36, fontWeight: 'bold' },
});