import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useUser } from '../context/UserContext';
import { getUserByEmail } from '../services/api';
import UserCard from '../components/UserCard';
import { Buffer } from 'buffer';

export default function HomeScreen() {
  const router = useRouter();
  const { user, setUser } = useUser();

  useEffect(() => {
    const bootstrap = async () => {
      if (user) return; // already loaded

      const jwt = await SecureStore.getItemAsync('jwt');
      if (!jwt) {
        router.replace('/auth');
        return;
      }

      try {
        const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString());
        const userData = await getUserByEmail(payload.mail);
        setUser(userData);
      } catch {
        await SecureStore.deleteItemAsync('jwt');
        router.replace('/auth');
      }
    };

    bootstrap();
  }, []);

  if (!user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3b82f6" size="large" />
      </View>
    );
  }

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('jwt');
    setUser(null);
    router.replace('/auth');
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Bonjour, {user.username} 👋</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logout}>Déconnexion</Text>
        </TouchableOpacity>
      </View>

      {/* Balance card with add/withdraw */}
      <UserCard compact={false} />

      {/* Bluetooth actions */}
      <Text style={styles.sectionTitle}>Paiement Bluetooth</Text>

      <TouchableOpacity
        style={[styles.button, styles.vendorButton]}
        onPress={() => router.push('/vendor')}
      >
        <Text style={styles.buttonIcon}>🏪</Text>
        <View>
          <Text style={styles.buttonText}>Mode Vendeur</Text>
          <Text style={styles.buttonSub}>Scanner un acheteur et encaisser</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.buyerButton]}
        onPress={() => router.push('/buyer')}
      >
        <Text style={styles.buttonIcon}>🛍️</Text>
        <View>
          <Text style={styles.buttonText}>Mode Acheteur</Text>
          <Text style={styles.buttonSub}>Attendre une demande de paiement</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1, backgroundColor: '#0f172a',
    justifyContent: 'center', alignItems: 'center',
  },
  container: {
    flex: 1, backgroundColor: '#0f172a', padding: 24, paddingTop: 56,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 24,
  },
  greeting: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  logout: { color: '#ef4444', fontSize: 13 },
  sectionTitle: {
    color: '#64748b', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 12,
  },
  button: {
    flexDirection: 'row', alignItems: 'center',
    padding: 18, borderRadius: 16, marginBottom: 12, gap: 16,
  },
  vendorButton: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#10b981' },
  buyerButton: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#8b5cf6' },
  buttonIcon: { fontSize: 32 },
  buttonText: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  buttonSub: { color: '#64748b', fontSize: 12, marginTop: 2 },
});
