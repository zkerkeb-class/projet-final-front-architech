import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl, ScrollView
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { getUserById } from '@/services/api';
import { useUser } from '@/context/UserContext';

export default function WalletScreen() {
  const router = useRouter();
  const { user, setUser } = useUser();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      const updated = await getUserById(user.id);
      setUser(updated);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const logout = async () => {
    await SecureStore.deleteItemAsync('jwt');
    setUser(null);
    router.replace('/login');
  };

  if (!user) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3b82f6" size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#3b82f6" />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Bonjour, {user.username} 👋</Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logout}>Déconnexion</Text>
        </TouchableOpacity>
      </View>

      {/* Balance card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Solde disponible</Text>
        <Text style={styles.balance}>{user.account_money.toFixed(2)} €</Text>
        <Text style={styles.cardSub}>Tirez vers le bas pour actualiser</Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.sendBtn]}
          onPress={() => router.push('/central')}
        >
          <Text style={styles.actionIcon}>📤</Text>
          <Text style={styles.actionLabel}>Envoyer</Text>
          <Text style={styles.actionSub}>Via Bluetooth</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.receiveBtn]}
          onPress={() => router.push('/peripheral')}
        >
          <Text style={styles.actionIcon}>📡</Text>
          <Text style={styles.actionLabel}>Recevoir</Text>
          <Text style={styles.actionSub}>Activer l'antenne</Text>
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>Comment ça marche ?</Text>
        <Text style={styles.infoText}>
          Bayment utilise le Bluetooth pour transférer de la valeur entre deux appareils,
          sans connexion Internet. Chaque fragment est signé cryptographiquement
          et ne peut être dépensé qu'une seule fois.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#0f172a' },
  container: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 24, marginTop: 8,
  },
  greeting: { fontSize: 18, fontWeight: '700', color: '#f8fafc' },
  logout: { color: '#ef4444', fontSize: 13 },
  card: {
    backgroundColor: '#1e40af', borderRadius: 20,
    padding: 28, alignItems: 'center', marginBottom: 24,
  },
  cardLabel: { color: '#bfdbfe', fontSize: 14, marginBottom: 8 },
  balance: { fontSize: 52, fontWeight: '900', color: '#fff', marginBottom: 4 },
  cardSub: { color: '#93c5fd', fontSize: 12 },
  actions: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  actionBtn: {
    flex: 1, borderRadius: 16, padding: 20, alignItems: 'center',
  },
  sendBtn: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#3b82f6' },
  receiveBtn: { backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#8b5cf6' },
  actionIcon: { fontSize: 32, marginBottom: 8 },
  actionLabel: { color: '#f1f5f9', fontSize: 16, fontWeight: '700' },
  actionSub: { color: '#64748b', fontSize: 12, marginTop: 4 },
  infoBox: {
    backgroundColor: '#1e293b', borderRadius: 16,
    padding: 20, borderWidth: 1, borderColor: '#334155',
  },
  infoTitle: { color: '#94a3b8', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  infoText: { color: '#64748b', fontSize: 13, lineHeight: 20 },
});
