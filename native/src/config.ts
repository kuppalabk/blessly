// The public address of the Blessly web app and its API. Set EXPO_PUBLIC_API_URL to point at staging.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://blessly.app').replace(/\/$/, '');
