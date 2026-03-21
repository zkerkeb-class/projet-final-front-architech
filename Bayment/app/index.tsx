import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, PermissionsAndroid, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { request, PERMISSIONS } from 'react-native-permissions';
import { useUser } from '../context/UserContext';
import UserCard from '../components/UserCard';

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useUser();

  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    } else {
      await request(PERMISSIONS.IOS.BLUETOOTH);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Username in top right corner */}
      {user && (
        <View style={styles.header}>
          <Text style={styles.username}>👤 {user.username}</Text>
        </View>
      )}

      <View style={styles.titleContainer}>
        <Text style={styles.title}>Bayment</Text>
        <Text style={styles.subtitle}>Connecter, Payer, Sourier </Text>
      </View>

      {user ? (
        <>
          {/* Full user card with add/withdraw buttons */}
          <UserCard compact={false} />

          <TouchableOpacity
            style={[styles.button, styles.buyerButton]}
            onPress={() => router.push('/buyer')}
          >
            <Text style={[styles.buttonText, styles.buyerButtonText]}>Vendeur</Text>{/*a remplacé par acheteur*/}
            <Text style={[styles.buttonSubtext, styles.buyerButtonSubtext]}>Attendre un acheteur et payer</Text>{/*a remplacé par vendeur*/}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.vendorButton]}
            onPress={() => router.push('/vendor')}
          >
            <Text style={[styles.buttonText, styles.vendorButtonText]}>Acheteur</Text>{/*a remplacé par vendeur*/}
            <Text style={[styles.buttonSubtext, styles.vendorButtonSubtext]}>Scanner un vendeur et encaisser</Text>{/*a remplacé par acheteur*/}
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity
          style={styles.loginButton}
          onPress={() => router.push('/auth')}
        >
          <Text style={styles.buttonText}>Se connecter</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#FAF9F6',
    justifyContent: 'center'
  },
  header: { position: 'absolute', top: 48, right: 24 },
  username: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  titleContainer: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 56,
    fontWeight: '900',
    color: '#429E9D',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: '#14B8A6',
    padding: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#14B8A6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  button: {
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
  },
  buyerButton: {
    backgroundColor: '#429E9D',
    borderColor: '#429E9D',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 4,
  },
  vendorButton: {
    backgroundColor: '#4A7572',
    borderColor: '#4A7572',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 4,
  },
  buttonText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  buyerButtonText: {
    color: '#FFFFFF',
  },
  vendorButtonText: {
    color: '#FFFFFF',
  },
  buttonSubtext: {
    fontSize: 16,
    marginTop: 4,
    fontWeight: '500',
  },
  buyerButtonSubtext: {
    color: '#8ADEDC',
  },
  vendorButtonSubtext: {
    color: '#82ADAA',
  },
});
