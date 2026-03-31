import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert
} from 'react-native';
import { useUser } from '../context/UserContext';
import { updateAccountMoney, getUserById } from '../services/api';

type UserCardProps = {
  compact?: boolean; // compact mode for vendor/buyer screens
};

export default function UserCard({ compact = false }: UserCardProps) {
  const { user, setUser } = useUser();
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'add' | 'withdraw'>('add');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const openModal = (type: 'add' | 'withdraw') => {
    setModalType(type);
    setAmount('');
    setModalVisible(true);
  };

  const handleConfirm = async () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      Alert.alert('Erreur', 'Veuillez entrer un montant valide');
      return;
    }

    if (modalType === 'withdraw' && parsedAmount > user!.account_money) {
      Alert.alert('Erreur', 'Solde insuffisant');
      return;
    }

    setLoading(true);
    try {
      const finalAmount = modalType === 'withdraw' ? -parsedAmount : parsedAmount;
      await updateAccountMoney(user!.id, finalAmount);
      // Refresh user data
      const updatedUser = await getUserById(user!.id);
      setUser(updatedUser);
      setModalVisible(false);
    } catch (err: any) {
      Alert.alert('Erreur', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  // Compact mode for vendor/buyer screens
  if (compact) {
    return (
      <View style={styles.compactCard}>
        <Text style={styles.compactLabel}>💰 Solde</Text>
        <Text style={styles.compactAmount}>{user.account_money} €</Text>
      </View>
    );
  }

  // Full mode for index screen
  return (
    <View style={styles.card}>
      {/* Balance */}
      <Text style={styles.balanceLabel}>Solde disponible</Text>
      <Text style={styles.balanceAmount}>{user.account_money} €</Text>

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.addButton]}
          onPress={() => openModal('add')}
        >
          <Text style={styles.actionButtonText}>+ Ajouter</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.withdrawButton]}
          onPress={() => openModal('withdraw')}
        >
          <Text style={styles.actionButtonText}>- Retirer</Text>
        </TouchableOpacity>
      </View>

      {/* Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {modalType === 'add' ? '➕ Ajouter des fonds' : '➖ Retirer des fonds'}
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="0.00"
              placeholderTextColor="#475569"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
              autoFocus
            />

            <Text style={styles.modalCurrency}>€</Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  modalType === 'add' ? styles.confirmAddButton : styles.confirmWithdrawButton,
                  loading && { opacity: 0.7 }
                ]}
                onPress={handleConfirm}
                disabled={loading}
              >
                <Text style={styles.modalButtonText}>
                  {loading ? 'Chargement...' : 'Confirmer'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full card styles
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  balanceLabel: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  balanceAmount: {
    color: '#10b981',
    fontSize: 56,
    fontWeight: 'bold',
    marginBottom: 32,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 12,
    alignItems: 'center',
  },
  addButton: { backgroundColor: '#10b981' },
  withdrawButton: { backgroundColor: '#ef4444' },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Compact card styles
  compactCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  compactLabel: { color: '#94a3b8', fontSize: 14 },
  compactAmount: { color: '#10b981', fontSize: 22, fontWeight: 'bold' },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 32,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  modalInput: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    fontSize: 48,
    fontWeight: 'bold',
    textAlign: 'center',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginBottom: 8,
  },
  modalCurrency: {
    color: '#94a3b8',
    fontSize: 16,
    marginBottom: 32,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: { backgroundColor: '#334155' },
  confirmAddButton: { backgroundColor: '#10b981' },
  confirmWithdrawButton: { backgroundColor: '#ef4444' },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});