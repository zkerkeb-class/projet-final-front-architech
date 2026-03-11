import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[
      styles.container,
      {
        paddingTop: insets.top > 0 ? insets.top : 24,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 24
      }
    ]}>
      <Text style={styles.title}>Bayment</Text>
      <Text style={styles.subtitle}>Connectez, Payez, Souriez !</Text>

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

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.button, styles.authButton]} onPress={() => router.push('/auth')}>
          <Text style={styles.buttonText}>Connexion</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#0f172a' },
  title: { textAlign: 'center', fontSize: 54, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8, marginTop: 16 },
  subtitle: { textAlign: 'center', fontSize: 16, color: '#94a3b8', marginBottom: 32 },
  button: {
    padding: 14, borderRadius: 10,
    alignItems: 'center', marginBottom: 16
  },
  footer: {flex: 1, justifyContent: 'flex-end', },
  authButton: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 80
  },
  peripheralButton: { backgroundColor: '#8b5cf6' },
  centralButton: { backgroundColor: '#3b82f6' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSubtext: { color: '#e2e8f0', fontSize: 12, marginTop: 4 },
});