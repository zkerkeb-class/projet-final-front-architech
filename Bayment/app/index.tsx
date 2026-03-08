import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📶 Bluetooth Messenger</Text>
      <Text style={styles.subtitle}>Choose your role:</Text>

      <TouchableOpacity
        style={[styles.button, styles.peripheralButton]}
        onPress={() => router.push('/peripheral')}
      >
        <Text style={styles.buttonText}>📡 Receive Mode</Text>
        <Text style={styles.buttonSubtext}>Advertise & wait for a message</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.centralButton]}
        onPress={() => router.push('/central')}
      >
        <Text style={styles.buttonText}>📤 Send Mode</Text>
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