import { Platform } from 'react-native';

const API_URL = 'http://54.175.240.74:3000';  

export const requestMagicLink = async (mail: string) => {
  console.log(API_URL);
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mail }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message);
  return data;
};

export const getUserById = async (id: number) => {
  const response = await fetch(`${API_URL}/users/${id}`);
  if (!response.ok) throw new Error('User not found');
  return await response.json();
};

export const updateAccountMoney = async (id: number, amount: number) => {
  const response = await fetch(`${API_URL}/users/${id}/account-money`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  if (!response.ok) throw new Error('Failed to update balance');
  return await response.json();
};

export const getUserByEmail = async (mail: string) => {
  const response = await fetch(`${API_URL}/users/mail/${mail}`);
  if (!response.ok) throw new Error('User not found');
  return await response.json();
};
