import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, Platform, Alert, PermissionsAndroid,
  TextInput, Modal, StatusBar
} from 'react-native';
import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUser } from '../context/UserContext';
import UserCard from '../components/UserCard';
import { updateAccountMoney, getUserById } from '../services/api';
import { getOrCreateIdentity, getBalance, createGenesis, preparePayment } from '../services/utxo';

type TransactionStatus = 'idle' | 'connected' | 'entering_amount' | 'waiting' | 'done';

export default function VendorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, setUser } = useUser();
  const [devices, setDevices] = useState<BluetoothDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<BluetoothDevice | null>(null);
  const connectedDeviceRef = useRef<BluetoothDevice | null>(null);
  const [status, setStatus] = useState('Prêt à scanner des acheteurs');
  const [txStatus, setTxStatus] = useState<TransactionStatus>('idle');
  const [amountModalVisible, setAmountModalVisible] = useState(false);
  const [amount, setAmount] = useState('');
  const subscriptionRef = useRef<any>(null);
  const amountRef = useRef<number>(0);
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
    return () => {
      if (subscriptionRef.current) subscriptionRef.current.remove();
    };
  }, [user]);

  const handleRecharge = async () => {
    const onlineAmount = user?.account_money ?? 0;
    if (onlineAmount <= 0) {
      Alert.alert('Solde vide', "Ajoutez d'abord de l'argent en ligne via votre carte.");
      return;
    }
    const currentUtxo = await getBalance(myPubRef.current);
    if (currentUtxo > 0) {
      Alert.alert('Wallet déjà chargé', `Vous avez déjà ${currentUtxo.toFixed(2)} € offline. Dépensez-les d'abord.`);
      return;
    }
    try {
      await updateAccountMoney(user!.id, -onlineAmount);
      const updatedUser = await getUserById(user!.id);
      setUser(updatedUser);
      await createGenesis(onlineAmount, myPubRef.current);
      const newBal = await getBalance(myPubRef.current);
      setUtxoBalance(newBal);
      Alert.alert('✅ Rechargé', `${onlineAmount} € transférés dans votre wallet offline.`);
    } catch {
      Alert.alert('Erreur', 'Recharge impossible — vérifiez votre connexion.');
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
    }
  };

  const startScan = async () => {
    await requestPermissions();
    setDevices([]);
    setStatus('Recherche en cours...');
    try {
      const paired = await RNBluetoothClassic.getBondedDevices();
      setDevices(paired);
      const unpaired = await RNBluetoothClassic.startDiscovery();
      setDevices(prev => [...prev, ...unpaired]);
      setStatus('Scan terminé — Choisissez un appareil');
    } catch (err: any) {
      setStatus(`Échec du scan : ${err.message}`);
    }
  };

  const connectToDevice = async (device: BluetoothDevice) => {
    setStatus('Connexion...');
    try {
      const connected = await device.connect({
        connectorType: 'rfcomm',
        DELIMITER: '\n',
        DEVICE_CHARSET: Platform.OS === 'ios' ? 1536 : 'utf-8',
      });
      if (connected) {
        setConnectedDevice(device);
        connectedDeviceRef.current = device;
        setTxStatus('connected');
        setStatus(`Connecté à ${device.name} !`);
        subscriptionRef.current = device.onDataReceived((data: any) => {
          handleBuyerResponse(data.data.trim());
        });
      }
    } catch (err: any) {
      setStatus(`Échec de connexion : ${err.message}`);
    }
  };

  const handleBuyerResponse = (message: string) => {
    if (message === 'ACCEPTED') {
      const parsedAmount = amountRef.current;

      // Online sync — silencieux si hors ligne
      try {
        updateAccountMoney(user!.id, parsedAmount)
          .then(async () => {
            const updatedUser = await getUserById(user!.id);
            setUser(updatedUser);
          })
          .catch(() => {});
      } catch {}

      getBalance(myPubRef.current).then(setUtxoBalance);
      setAmount('');
      amountRef.current = 0;
      setTxStatus('connected');
      setStatus(`Transaction réussie avec ${connectedDevice?.name}`);
      Alert.alert('Paiement reçu !', `L'acheteur vous a versé ${parsedAmount} €`);

    } else if (message === 'REFUSED') {
      setAmount('');
      amountRef.current = 0;
      setTxStatus('connected');
      setStatus(`Transaction refusée par ${connectedDevice?.name}`);
      Alert.alert('Annulé', "L'acheteur a refusé la transaction.");

    } else if (message === 'INSUFFICIENT') {
      setAmount('');
      amountRef.current = 0;
      setTxStatus('connected');
      setStatus("Solde de l'acheteur insuffisant");
      Alert.alert('Échec', "L'acheteur n'a pas les fonds nécessaires.");
    }
  };

  const sendAmount = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Erreur', 'Veuillez entrer un montant valide');
      return;
    }
    if (!connectedDeviceRef.current) return;

    const currentBal = await getBalance(myPubRef.current);
    if (currentBal < parsedAmount) {
      Alert.alert('Solde UTXO insuffisant', `Vous avez ${currentBal.toFixed(2)} € offline. Rechargez votre wallet.`);
      return;
    }

    const buyerPub = `buyer_${connectedDeviceRef.current.address}`;
    const result = await preparePayment(myPubRef.current, buyerPub, parsedAmount);

    if (!result) {
      amountRef.current = parsedAmount;
      await connectedDeviceRef.current.write(`AMOUNT:${parsedAmount}\n`);
    } else {
      amountRef.current = parsedAmount;
      await connectedDeviceRef.current.write(`FRAGMENT:${JSON.stringify(result.fragmentToSend)}\n`);
      const newBal = await getBalance(myPubRef.current);
      setUtxoBalance(newBal);
    }

    setAmountModalVisible(false);
    setTxStatus('waiting');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top || 48 }]}>
      <StatusBar barStyle="dark-content" />

      {user && (
        <View style={styles.header}>
          <Text style={styles.username}>👤 {user.username}</Text>
        </View>
      )}

      <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>⇦ Retour</Text>
      </TouchableOpacity>

      <View style={styles.titleSection}>
        <Text style={styles.title}>Mode Vendeur ↗</Text>
        <Text style={styles.statusText}>{status}</Text>
      </View>

      <UserCard compact={true} />

      {/* UTXO offline balance */}
      <View style={styles.utxoCard}>
        <View>
          <Text style={styles.utxoLabel}>💎 Solde offline (UTXO)</Text>
          <Text style={styles.utxoAmount}>{utxoBalance.toFixed(2)} €</Text>
        </View>
        <TouchableOpacity style={styles.rechargeBtn} onPress={handleRecharge}>
          <Text style={styles.rechargeBtnText}>⚡ Recharger</Text>
        </TouchableOpacity>
      </View>

      {txStatus === 'idle' && (
        <>
          <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={startScan}>
            <Text style={styles.buttonText}>Scanner les acheteurs</Text>
          </TouchableOpacity>

          <FlatList
            data={devices}
            keyExtractor={(item) => item.address}
            contentContainerStyle={styles.listContainer}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.deviceItem, connectedDevice?.address === item.address && styles.connectedDevice]}
                onPress={() => connectToDevice(item)}
              >
                <View>
                  <Text style={styles.deviceName}>{item.name || 'Inconnu'}</Text>
                  <Text style={styles.deviceId}>{item.address}</Text>
                </View>
                <Text style={styles.connectLabel}>Connecter</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Aucun appareil trouvé pour le moment...</Text>}
          />
        </>
      )}

      {txStatus === 'connected' && (
        <View style={styles.actionSection}>
          <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={() => setAmountModalVisible(true)}>
            <Text style={styles.buttonText}>Encaisser un montant</Text>
          </TouchableOpacity>
        </View>
      )}

      {txStatus === 'waiting' && (
        <View style={styles.waitingCard}>
          <Text style={styles.waitingIcon}>⏳</Text>
          <Text style={styles.waitingText}>En attente de validation par l'acheteur...</Text>
        </View>
      )}

      <Modal visible={amountModalVisible} transparent animationType="slide" onRequestClose={() => setAmountModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIndicator} />
            <Text style={styles.modalTitle}>💶 Montant à encaisser</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.modalInput}
                placeholder="0"
                placeholderTextColor="#94A3B8"
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                autoFocus
              />
              <Text style={styles.modalCurrency}>€</Text>
            </View>
            <Text style={styles.utxoHint}>Solde offline disponible : {utxoBalance.toFixed(2)} €</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setAmountModalVisible(false)}>
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={sendAmount}>
                <Text style={styles.confirmButtonText}>Envoyer la demande</Text>
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
    backgroundColor: '#F0FDFA', borderRadius: 16, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: '#CCFBF1',
  },
  utxoLabel: { color: '#0F766E', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  utxoAmount: { color: '#0F766E', fontSize: 20, fontWeight: '800' },
  rechargeBtn: { backgroundColor: '#14B8A6', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  rechargeBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  listContainer: { paddingBottom: 24 },
  button: {
    padding: 20, borderRadius: 20, alignItems: 'center', marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 3,
  },
  primaryButton: { backgroundColor: '#14B8A6' },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  deviceItem: {
    backgroundColor: '#FFFFFF', padding: 20, borderRadius: 20, marginBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  connectedDevice: { borderColor: '#14B8A6', borderWidth: 2 },
  deviceName: { color: '#1E293B', fontSize: 17, fontWeight: '700' },
  deviceId: { color: '#94A3B8', fontSize: 12, marginTop: 2 },
  connectLabel: { color: '#14B8A6', fontWeight: '700', fontSize: 14 },
  empty: { color: '#94A3B8', textAlign: 'center', marginTop: 40, fontSize: 15 },
  actionSection: { marginTop: 'auto', marginBottom: 24 },
  waitingCard: {
    backgroundColor: '#FFFFFF', padding: 40, borderRadius: 28,
    alignItems: 'center', marginTop: 24,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  waitingIcon: { fontSize: 48, marginBottom: 16 },
  waitingText: { color: '#64748B', fontSize: 16, textAlign: 'center', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 32,
    borderTopRightRadius: 32, padding: 32, paddingTop: 12, alignItems: 'center'
  },
  modalIndicator: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, marginBottom: 28 },
  modalTitle: { color: '#1E293B', fontSize: 22, fontWeight: '800', marginBottom: 32 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  modalInput: { color: '#1E293B', fontSize: 56, fontWeight: '800', textAlign: 'center', padding: 0 },
  modalCurrency: { color: '#94A3B8', fontSize: 32, fontWeight: '600', marginLeft: 8 },
  utxoHint: { color: '#0F766E', fontSize: 13, fontWeight: '600', marginBottom: 32 },
  modalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  modalButton: { flex: 1, padding: 18, borderRadius: 20, alignItems: 'center' },
  cancelButton: { backgroundColor: '#F1F5F9' },
  confirmButton: { backgroundColor: '#14B8A6' },
  cancelButtonText: { color: '#64748B', fontSize: 16, fontWeight: '800' },
  confirmButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
