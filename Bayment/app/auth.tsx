import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Animated, ActivityIndicator, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Buffer } from 'buffer';
import { requestMagicLink } from '../services/api';
import { useUser } from '../context/UserContext';
import { getUserByEmail } from '../services/api';

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const { setUser } = useUser();

  const [toast, setToast] = useState<{ message: string, type: 'error' | 'success' } | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (params.token) {
      handleTokenReceived(params.token as string);
    }
  }, [params.token]);

  const handleTokenReceived = async (token: string) => {
    try {
      setLoading(true);

      let userEmail = '';
      try {
        const payload = token.split('.')[1];
        const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
        userEmail = decoded.mail;
      } catch (e) {
        console.log("Token decoding error:", e);
      }

      const userData = await getUserByEmail(userEmail);
      setUser(userData);

      showToast('Connection successful !', 'success');

      setTimeout(() => {
        router.replace('/');
      }, 1500);
    } catch (error) {
      showToast('Error while connecting.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (message: string, type: 'error' | 'success') => {
    setToast({ message, type });

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: insets.top + 10, duration: 300, useNativeDriver: true })
    ]).start();

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: -100, duration: 300, useNativeDriver: true })
      ]).start(() => setToast(null));
    }, 3000);
  };

  const handleLogin = async () => {
    if (!email) {
      showToast('Enter your e-mail address.', 'error');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showToast('Unvalide e-mail address.', 'error');
      return;
    }

    setLoading(true);

    try {
      await requestMagicLink(email.toLowerCase());
      setLinkSent(true);
      showToast('Magic link sent! Please check your mailbox', 'success');
    } catch (error: any) {
      showToast(error.message || 'Something showed up.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {toast && (
        <Animated.View
          style={[
            styles.toast,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
              backgroundColor: toast.type === 'error' ? '#EF4444' : '#14B8A6'
            }
          ]}
        >
          <Text style={styles.toastText}>
            {toast.type === 'error' ? 'Échec : ' : ''}
            {toast.message}
          </Text>
        </Animated.View>
      )}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContainer,
            {
              paddingTop: (insets.top || 48) + 20,
              paddingBottom: insets.bottom || 24
            }
          ]}
        >
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : null}
            style={[styles.backButton, { top: insets.top || 48 }]}
          >
            <Text style={styles.backText}>{router.canGoBack() ? '⇦ Retour' : ''}</Text>
          </TouchableOpacity>

          <View style={styles.headerSection}>
            <Text style={styles.title}>Bayment</Text>
            <Text style={styles.subtitle}>Connectez-vous à votre compte</Text>
          </View>

          {!linkSent ? (
            <View style={styles.card}>
              <Text style={styles.instructionText}>
                Enter your e-mail address to receive your Magic Link.
              </Text>

              <View style={styles.form}>
                <Text style={styles.label}>E-mail address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your e-mail address"
                  placeholderTextColor="#94A3B8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                  editable={!loading}
                />

                <TouchableOpacity
                  style={[styles.button, loading && { opacity: 0.7 }]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Get your Magic Link</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.successCard}>
              <View style={styles.iconCircle}>
                <Text style={styles.successIcon}>📧</Text>
              </View>
              <Text style={styles.successTitle}>Magic Link sent !</Text>
              <Text style={styles.successSubtitle}>
                A Magic Link has been sent to : {"\n"}
                <Text style={styles.emailHighlight}>{email}</Text>
              </Text>
              <Text style={styles.instruction}>
                Click on the link in the e-mail from this device to connect.
              </Text>

              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => setLinkSent(false)}
              >
                <Text style={styles.retryText}>Use another e-mail address</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF9F6' },
  scrollContainer: { padding: 24, flexGrow: 1 },
  backButton: { position: 'absolute', left: 24, zIndex: 10 },
  backText: { color: '#64748B', fontSize: 16, fontWeight: '600' },
  headerSection: { alignItems: 'center', marginBottom: 40, marginTop: 40 },
  title: { fontSize: 48, fontWeight: '900', color: '#14B8A6', letterSpacing: -1 },
  subtitle: { fontSize: 18, color: '#64748B', fontWeight: '500', marginTop: -4 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  instructionText: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  form: { width: '100%' },
  label: { color: '#1E293B', fontSize: 14, marginBottom: 8, fontWeight: '700' },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 18,
    color: '#1E293B',
    fontSize: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  button: {
    backgroundColor: '#14B8A6',
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#14B8A6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  successCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#F0FDFA', justifyContent: 'center', alignItems: 'center',
    marginBottom: 24, borderWidth: 1, borderColor: '#CCFBF1'
  },
  successIcon: { fontSize: 48 },
  successTitle: { fontSize: 24, fontWeight: '900', color: '#1E293B', marginBottom: 16 },
  successSubtitle: { fontSize: 16, color: '#64748B', textAlign: 'center', lineHeight: 24 },
  emailHighlight: { color: '#14B8A6', fontWeight: '800' },
  instruction: { fontSize: 14, color: '#94A3B8', textAlign: 'center', marginTop: 24, fontStyle: 'italic', lineHeight: 20 },
  retryButton: { marginTop: 40 },
  retryText: { color: '#14B8A6', fontSize: 15, fontWeight: '700' },
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    padding: 18,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 9999,
  },
  toastText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});