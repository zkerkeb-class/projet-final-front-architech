import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

export type Fragment = {
  id: string;
  parentIds: string[];
  value: number;
  ownerPub: string;
  createdAt: string;
  isSpent: boolean;
};

const FRAGMENTS_KEY = 'utxo:fragments';
const IDENTITY_KEY = 'utxo:identity';

// ─── Identity ────────────────────────────────────────────────
export const getOrCreateIdentity = async (): Promise<string> => {
  const existing = await AsyncStorage.getItem(IDENTITY_KEY);
  if (existing) return existing;
  const id = uuidv4();
  await AsyncStorage.setItem(IDENTITY_KEY, id);
  return id;
};

// ─── Storage ─────────────────────────────────────────────────
const loadFragments = async (): Promise<Fragment[]> => {
  const raw = await AsyncStorage.getItem(FRAGMENTS_KEY);
  return raw ? JSON.parse(raw) : [];
};

const saveFragments = async (fragments: Fragment[]) => {
  await AsyncStorage.setItem(FRAGMENTS_KEY, JSON.stringify(fragments));
};

// ─── Core operations ─────────────────────────────────────────

/** Crée un fragment genesis (rechargement de compte) */
export const createGenesis = async (amount: number, ownerPub: string): Promise<Fragment> => {
  const fragment: Fragment = {
    id: uuidv4(),
    parentIds: [],
    value: amount,
    ownerPub,
    createdAt: new Date().toISOString(),
    isSpent: false,
  };
  const fragments = await loadFragments();
  fragments.push(fragment);
  await saveFragments(fragments);
  return fragment;
};

/** Calcule le solde UTXO d'un owner */
export const getBalance = async (ownerPub: string): Promise<number> => {
  const fragments = await loadFragments();
  return fragments
    .filter(f => f.ownerPub === ownerPub && !f.isSpent)
    .reduce((sum, f) => sum + f.value, 0);
};

/** Récupère tous les fragments non dépensés d'un owner */
export const getUnspentFragments = async (ownerPub: string): Promise<Fragment[]> => {
  const fragments = await loadFragments();
  return fragments.filter(f => f.ownerPub === ownerPub && !f.isSpent);
};

/**
 * Prépare un paiement côté vendeur :
 * - Sélectionne les fragments suffisants
 * - Les marque comme spent localement
 * - Retourne le fragment à envoyer au buyer via BLE
 */
export const preparePayment = async (
  senderPub: string,
  recipientPub: string,
  amount: number
): Promise<{ fragmentToSend: Fragment; changeFragment: Fragment | null } | null> => {
  const fragments = await loadFragments();
  const unspent = fragments.filter(f => f.ownerPub === senderPub && !f.isSpent);

  const balance = unspent.reduce((s, f) => s + f.value, 0);
  if (balance < amount) return null;

  // Sélection greedy des fragments
  let collected = 0;
  const used: Fragment[] = [];
  for (const f of unspent) {
    used.push(f);
    collected += f.value;
    if (collected >= amount) break;
  }

  const change = collected - amount;
  const now = new Date().toISOString();
  const usedIds = used.map(f => f.id);

  // Fragment pour le recipient
  const fragmentToSend: Fragment = {
    id: uuidv4(),
    parentIds: usedIds,
    value: amount,
    ownerPub: recipientPub,
    createdAt: now,
    isSpent: false,
  };

  // Fragment de change pour le sender
  const changeFragment: Fragment | null = change > 0 ? {
    id: uuidv4(),
    parentIds: usedIds,
    value: change,
    ownerPub: senderPub,
    createdAt: now,
    isSpent: false,
  } : null;

  // Marquer les parents comme spent
  const updated = fragments.map(f =>
    usedIds.includes(f.id) ? { ...f, isSpent: true } : f
  );

  // Ajouter change si existant
  if (changeFragment) updated.push(changeFragment);

  await saveFragments(updated);
  return { fragmentToSend, changeFragment };
};

/**
 * Reçoit un fragment envoyé par BLE côté buyer.
 * Vérifie que le fragment n'existe pas déjà (double-spend).
 */
export const receiveFragment = async (fragment: Fragment): Promise<boolean> => {
  const fragments = await loadFragments();

  // Double-spend check — fragment ID déjà connu
  const alreadyExists = fragments.some(f => f.id === fragment.id);
  if (alreadyExists) return false;

  fragments.push({ ...fragment, isSpent: false });
  await saveFragments(fragments);
  return true;
};

/** Reset complet — utile pour les tests */
export const resetUTXO = async () => {
  await AsyncStorage.removeItem(FRAGMENTS_KEY);
  await AsyncStorage.removeItem(IDENTITY_KEY);
};
