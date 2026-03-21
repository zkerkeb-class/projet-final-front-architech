import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, Alert, Modal, StatusBar
} from 'react-native';
import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../context/UserContext';
import UserCard from '../components/UserCard';
import { updateAccountMoney, getUserById } from '../services/api';
import { getOrCreateIdentity, getBalance, receiveFragment, Fragment } from '../services/utxo';

export default function BuyerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, setUser } = useUser();
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Prêt à attendre un acheteur');//C censé etre vendeur
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [pendingAmount, setPendingAmount] = useState<number>(0);
  const [pendingFragment, setPendingFragment] = useState<Fragment | null>(null);
  const subscriptionRef = useRef<any>(null);
  const [utxoBalance, setUtxoBalance] = useState(0);
  const myPubRef = useRef('');
  const initDoneRef = useRef(false);

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
      setStatus('Attente de connexion vendeur...');
      const device = await RNBluetoothClassic.accept({ delimiter: '\n' });
      if (device) {
        setConnectedDevice(device);
        setStatus(`Connecté à ${device.name} ! Attente de la demande...`);
        subscriptionRef.current = device.onDataReceived((data: any) => {
          handleVendorMessage(data.data.trim(), device);
        });
      }
    } catch (err: any) {
      setStatus(`Échec : ${err.message}`);
      setIsListening(false);
    }
  };

  const handleVendorMessage = (message: string, device: BluetoothDevice) => {
    if (message.startsWith('FRAGMENT:')) {
      try {
        const fragment: Fragment = JSON.parse(message.replace('FRAGMENT:', ''));
        setPendingFragment(fragment);
        setPendingAmount(fragment.value);
        setStatus(`Transaction entrante : ${fragment.value} €`);
        setTimeout(() => checkAndProcessPayment(fragment.value, device), 2000);
      } catch {
        setStatus('⚠️ Fragment invalide reçu');
        device.write('REFUSED\n');
      }
      return;
    }
    if (message.startsWith('AMOUNT:')) {
      const amount = parseFloat(message.replace('AMOUNT:', ''));
      setPendingAmount(amount);
      setPendingFragment(null);
      setStatus(`Transaction entrante : ${amount} €`);
      setTimeout(() => checkAndProcessPayment(amount, device), 2000);
    }
  };

  const checkAndProcessPayment = (amount: number, device: BluetoothDevice) => {
    const currentBalance = user!.account_money;
    if (currentBalance < amount) {
      device.write('INSUFFICIENT\n');
      Alert.alert('Solde insuffisant', `Vous avez ${currentBalance} € mais la transaction est de ${amount} €`);
      setStatus('Attente de connexion acheteur...');//a remplacé par vendeur
    } else {
      setConfirmModalVisible(true);
    }
  };

  const handleAccept = async () => {
    setConfirmModalVisible(false);
    try {
      // UTXO — stocker le fragment avec notre propre pub
      if (pendingFragment) {
        const fragmentWithMyPub = { ...pendingFragment, ownerPub: myPubRef.current };
        const accepted = await receiveFragment(fragmentWithMyPub);
        if (accepted) {
          const newBal = await getBalance(myPubRef.current);
          setUtxoBalance(newBal);
        }
      }

      // Online sync — silencieux si hors ligne
      try {
        await updateAccountMoney(user!.id, -pendingAmount);
        const updatedUser = await getUserById(user!.id);
        setUser(updatedUser);
      } catch {}

      await connectedDevice?.write('ACCEPTED\n');
      setStatus('Attente de connexion acheteur...');//a remplacé par vendeur
      Alert.alert('Transaction acceptée !', `${pendingAmount} € débités. Solde UTXO mis à jour.`);
      setPendingFragment(null);
    } catch (err: any) {
      Alert.alert('Erreur', err.message);
    }
  };

  const handleRefuse = async () => {
    setConfirmModalVisible(false);
    await connectedDevice?.write('REFUSED\n');
    setPendingFragment(null);
    setStatus('Attente de connexion acheteur...');//a remplacé par vendeur
    Alert.alert('Transaction refusée', 'Vous avez annulé le paiement.');
  };

  const stopListening = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    setIsListening(false);
    setStatus('Arrêté');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top || 48 }]}>
      <StatusBar barStyle="dark-content" />

      {user && (
        <View style={styles.header}>
          <Text style={styles.username}>👤 {user.username}</Text>
        </View>
      )}

      <TouchableOpacity onPress={() => { stopListening(); router.back(); }} style={styles.backButton}>
        <Text style={styles.backText}>⇦ Retour</Text>
      </TouchableOpacity>

      <View style={styles.titleSection}>
        <Text style={styles.title}>Mode Vendeur ↘</Text>{/*a remplacé par acheteur*/}
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <UserCard compact={true} />

      {/* UTXO offline balance */}
      <View style={styles.utxoCard}>
        <Text style={styles.utxoLabel}>💎 Solde offline (UTXO)</Text>
        <Text style={styles.utxoAmount}>{utxoBalance.toFixed(2)} €</Text>
      </View>

      <View style={styles.actionSection}>
        {!isListening ? (
          <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={startListening}>
            <Text style={styles.buttonText}>Attendre un acheteur</Text>{/*a remplacé par vendeur*/}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.button, styles.stopButton]} onPress={stopListening}>
            <Text style={styles.buttonText}>Arrêter l'attente</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={confirmModalVisible} transparent animationType="slide" onRequestClose={() => handleRefuse()}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIndicator} />
            <Text style={styles.modalTitle}>Valider le paiement</Text>

            <View style={styles.amountCard}>
              <Text style={styles.amountLabel}>Montant à payer</Text>
              <Text style={styles.amountValue}>{pendingAmount} €</Text>
            </View>

            <View style={styles.balanceInfo}>
              <View style={styles.balanceRow}>
                <Text style={styles.infoLabel}>Solde actuel</Text>
                <Text style={styles.infoValue}>{user?.account_money} €</Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.infoLabel}>Nouveau solde</Text>
                <Text style={[styles.infoValue, styles.balanceAfter]}>
                  {(user?.account_money ?? 0) - pendingAmount} €
                </Text>
              </View>
              <View style={styles.balanceRow}>
                <Text style={styles.infoLabel}>UTXO après réception</Text>
                <Text style={[styles.infoValue, { color: '#14B8A6' }]}>
                  {(utxoBalance + pendingAmount).toFixed(2)} €
                </Text>
              </View>
              {pendingFragment && (
                <View style={styles.balanceRow}>
                  <Text style={styles.infoLabel}>Fragment ID</Text>
                  <Text style={[styles.infoValue, { fontSize: 10, color: '#94A3B8' }]}>
                    {pendingFragment.id.slice(0, 16)}...
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.refuseButton]} onPress={handleRefuse}>
                <Text style={styles.refuseButtonText}>Refuser</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.acceptButton]} onPress={handleAccept}>
                <Text style={styles.modalButtonText}>Accepter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#FAF9F6' },
  header: { position: 'absolute', top: 48, right: 24 },
  username: { color: '#64748B', fontSize: 14, fontWeight: '600' },
  backButton: { marginBottom: 24 },
  backText: { color: '#64748B', fontSize: 16, fontWeight: '600' },
  titleSection: { marginBottom: 24 },
  title: { fontSize: 32, fontWeight: '900', color: '#1E293B', letterSpacing: -1 },
  statusText: { fontSize: 15, color: '#64748B', marginTop: 4, fontWeight: '500' },
  utxoCard: {
    backgroundColor: '#F0FDFA',
    borderRadius: 16, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: '#CCFBF1',
  },
  utxoLabel: { color: '#0F766E', fontSize: 13, fontWeight: '600' },
  utxoAmount: { color: '#0F766E', fontSize: 20, fontWeight: '800' },
  actionSection: { marginTop: 'auto', marginBottom: 24 },
  button: {
    padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 56,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 3,
  },
  primaryButton: { backgroundColor: '#14B8A6' },
  stopButton: { backgroundColor: '#EF4444' },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 32, paddingTop: 12 },
  modalIndicator: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, marginBottom: 28, alignSelf: 'center' },
  modalTitle: { color: '#1E293B', fontSize: 22, fontWeight: '800', marginBottom: 24, textAlign: 'center' },
  amountCard: { backgroundColor: '#F8FAFC', borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 24, borderWidth: 1, borderColor: '#F1F5F9' },
  amountLabel: { color: '#64748B', fontSize: 14, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  amountValue: { color: '#1E293B', fontSize: 48, fontWeight: '900' },
  balanceInfo: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginBottom: 32, gap: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoLabel: { color: '#64748B', fontSize: 15, fontWeight: '500' },
  infoValue: { color: '#1E293B', fontSize: 15, fontWeight: '700' },
  balanceAfter: { color: '#EF4444' },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, padding: 18, borderRadius: 20, alignItems: 'center' },
  refuseButton: { backgroundColor: '#F1F5F9' },
  acceptButton: { backgroundColor: '#14B8A6' },
  refuseButtonText: { fontSize: 16, fontWeight: '800', color: '#64748B' },
  modalButtonText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
});
