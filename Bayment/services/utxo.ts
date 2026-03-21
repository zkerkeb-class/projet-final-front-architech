import * as SecureStore from 'expo-secure-store';

// SecureStore a une limite de 2048 bytes par clé
// On utilise un préfixe numéroté pour les fragments

export type Fragment = {
  id: string;
  parentIds: string[];
  value: number;
  ownerPub: string;
  createdAt: string;
  isSpent: boolean;
};

const IDENTITY_KEY = 'utxo_identity';
const FRAGMENTS_INDEX_KEY = 'utxo_index'; // liste des IDs séparés par ","

// ─── Identity ────────────────────────────────────────────────
export const getOrCreateIdentity = async (): Promise<string> => {
  const existing = await SecureStore.getItemAsync(IDENTITY_KEY);
  if (existing) return existing;
  const id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  await SecureStore.setItemAsync(IDENTITY_KEY, id);
  return id;
};

// ─── Storage ─────────────────────────────────────────────────
const loadFragments = async (): Promise<Fragment[]> => {
  const index = await SecureStore.getItemAsync(FRAGMENTS_INDEX_KEY);
  if (!index || index === '') return [];

  const ids = index.split(',').filter(Boolean);
  const fragments: Fragment[] = [];

  for (const id of ids) {
    const raw = await SecureStore.getItemAsync(`utxo_f_${id}`);
    if (raw) {
      try {
        fragments.push(JSON.parse(raw));
      } catch {}
    }
  }
  return fragments;
};

const saveFragment = async (f: Fragment) => {
  await SecureStore.setItemAsync(`utxo_f_${f.id}`, JSON.stringify(f));
};

const addToIndex = async (id: string) => {
  const index = await SecureStore.getItemAsync(FRAGMENTS_INDEX_KEY) ?? '';
  const ids = index.split(',').filter(Boolean);
  if (!ids.includes(id)) {
    ids.push(id);
    await SecureStore.setItemAsync(FRAGMENTS_INDEX_KEY, ids.join(','));
  }
};

// ─── Core operations ─────────────────────────────────────────

export const createGenesis = async (amount: number, ownerPub: string): Promise<Fragment> => {
  const id = `f_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fragment: Fragment = {
    id,
    parentIds: [],
    value: amount,
    ownerPub,
    createdAt: new Date().toISOString(),
    isSpent: false,
  };
  await saveFragment(fragment);
  await addToIndex(id);
  return fragment;
};

export const getBalance = async (ownerPub: string): Promise<number> => {
  const fragments = await loadFragments();
  return fragments
    .filter(f => f.ownerPub === ownerPub && !f.isSpent)
    .reduce((sum, f) => sum + f.value, 0);
};

export const getUnspentFragments = async (ownerPub: string): Promise<Fragment[]> => {
  const fragments = await loadFragments();
  return fragments.filter(f => f.ownerPub === ownerPub && !f.isSpent);
};

export const preparePayment = async (
  senderPub: string,
  recipientPub: string,
  amount: number
): Promise<{ fragmentToSend: Fragment; changeFragment: Fragment | null } | null> => {
  const fragments = await loadFragments();
  const unspent = fragments.filter(f => f.ownerPub === senderPub && !f.isSpent);

  const balance = unspent.reduce((s, f) => s + f.value, 0);
  if (balance < amount) return null;

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

  const recipientId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const fragmentToSend: Fragment = {
    id: recipientId,
    parentIds: usedIds,
    value: amount,
    ownerPub: recipientPub,
    createdAt: now,
    isSpent: false,
  };

  const changeId = `f_${Date.now() + 1}_${Math.random().toString(36).slice(2, 9)}`;
  const changeFragment: Fragment | null = change > 0 ? {
    id: changeId,
    parentIds: usedIds,
    value: change,
    ownerPub: senderPub,
    createdAt: now,
    isSpent: false,
  } : null;

  // Marquer les parents spent
  for (const f of used) {
    await saveFragment({ ...f, isSpent: true });
  }

  // Sauvegarder le change
  if (changeFragment) {
    await saveFragment(changeFragment);
    await addToIndex(changeId);
  }

  return { fragmentToSend, changeFragment };
};

export const receiveFragment = async (fragment: Fragment): Promise<boolean> => {
  const fragments = await loadFragments();
  const alreadyExists = fragments.some(f => f.id === fragment.id);
  if (alreadyExists) return false;

  await saveFragment({ ...fragment, isSpent: false });
  await addToIndex(fragment.id);
  return true;
};

export const resetUTXO = async () => {
  const index = await SecureStore.getItemAsync(FRAGMENTS_INDEX_KEY) ?? '';
  const ids = index.split(',').filter(Boolean);
  for (const id of ids) {
    await SecureStore.deleteItemAsync(`utxo_f_${id}`);
  }
  await SecureStore.deleteItemAsync(FRAGMENTS_INDEX_KEY);
  await SecureStore.deleteItemAsync(IDENTITY_KEY);
};