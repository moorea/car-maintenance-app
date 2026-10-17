import { Linking } from 'react-native'

/**
 * Where the privacy policy is published. App Store review needs it reachable from inside the app.
 * The site in apps/site publishes it on GitHub Pages; EXPO_PUBLIC_PRIVACY_POLICY_URL overrides that,
 * for example once the site has its own domain.
 */
export const PRIVACY_POLICY_URL =
  process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ??
  'https://moorea.github.io/car-maintenance-app/privacy/'

export const openPrivacyPolicy = () => void Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})
