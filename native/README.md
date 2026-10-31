# Blessly native app

Expo (React Native) app for Android and iOS. It mirrors the website (`src/app/(app)`) and calls the same `/api` routes.

## Conventions
- Screens live in `app/` (Expo Router). Each web page becomes one native screen with the same name.
- API calls go through `src/api/client.ts` (`api()`), with typed wrappers in `src/api/*.ts`.
- Sessions use the same httpOnly cookie as the website; the app sends `x-client: native`.
- User-facing text is written in English and wrapped in `t()` from `src/i18n`. Translations come from the website dictionaries in `src/locales/`. A string the website has not translated shows in English.
- Shared UI is in `src/ui/index.tsx` (Screen, Title, Section, Field, Button, Row, Empty, ErrorText, Loading).

## Run
- `npm install`, then `npx expo start`. Set `EXPO_PUBLIC_API_URL` to point at a staging server (default `https://blessly.app`).
- `npm run typecheck` checks types. `npx expo export --platform android --output-dir <dir>` checks that the bundle builds.
