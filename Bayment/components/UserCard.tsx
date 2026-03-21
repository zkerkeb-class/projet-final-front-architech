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
        <Text style={styles.compactLabel}>Solde</Text>
        <Text style={styles.compactAmount}>{user.account_money} €</Text>
      </View>
    );
  }

  // Full mode for index screen
  return (
    <View style={styles.card}>
      {/* Balance */}
      <Text style={styles.balanceLabel}>Disponible</Text>
      <Text style={styles.balanceAmount}>{user.account_money} €</Text>

      {/* Buttons */}
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.actionButton, styles.withdrawButton]}
          onPress={() => openModal('withdraw')}
        >
          <Text style={styles.withdrawButtonText}>- Retirer</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.addButton]}
          onPress={() => openModal('add')}
        >
          <Text style={styles.addButtonText}>+ Ajouter</Text>
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
            <View style={styles.modalIndicator} />
            <Text style={styles.modalTitle}>
              {modalType === 'add' ? 'Ajouter des fonds' : 'Retirer des fonds'}
            </Text>

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

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    marginBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  balanceLabel: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  balanceAmount: {
    color: '#242424',
    fontSize: 48,
    fontWeight: '800',
    marginBottom: 32,
    letterSpacing: -1,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    alignItems: 'center',
    flex: 1,
    minWidth: 120,
  },
  addButton: {
    backgroundColor: '#429E9D',
  },
  withdrawButton: {
    backgroundColor: '#4A7572',
  },
  addButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  withdrawButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Compact card styles
  compactCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  compactLabel: { color: '#64748B', fontSize: 14, fontWeight: '500' },
  compactAmount: { color: '#1E293B', fontSize: 20, fontWeight: 'bold' },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 32,
    paddingTop: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },
  modalIndicator: {
    width: 40,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    marginBottom: 28,
  },
  modalTitle: {
    color: '#1E293B',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 32,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  modalInput: {
    color: '#1E293B',
    fontSize: 56,
    fontWeight: '800',
    textAlign: 'center',
    padding: 0,
  },
  modalCurrency: {
    color: '#94A3B8',
    fontSize: 32,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    padding: 18,
    borderRadius: 20,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
  },
  cancelButtonText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '700',
  },
  confirmAddButton: { backgroundColor: '#0082FC' },
  confirmWithdrawButton: { backgroundColor: '#EF4444' },
  modalButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
