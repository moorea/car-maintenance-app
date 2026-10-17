import { Linking } from 'react-native'

/**
 * Where the privacy policy is published. App Store review needs it reachable from inside the app.
 * Until it has a home of its own it is read from the repository, which is public.
 */
export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ??
  'https://github.com/moorea/car-maintenance-app/blob/main/docs/app-store/privacy-policy.md'

export const openPrivacyPolicy = () => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})
