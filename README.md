# MyCommunidad

Mobile-first community issue reporting for Philippine barangays. Citizens submit observable infrastructure concerns, neighbors confirm them, and officials publish accountable updates.

## Architecture and privacy model

`users` contains only public-safe account metadata (`displayName`, `barangayId`, role). `userPrivateProfiles` holds phone, address, and email, and is never queried for a public feed. `reports` keeps issue data, never private profile fields; `reports/{id}/updates` provides its append-only timeline and `confirmations/{uid}` ensures one confirmation per user. Firebase custom claims—not client fields—authorize officials and admins.

Core collections: `barangays`, `categories`, `users`, `userPrivateProfiles`, `reports`, `reports/{id}/updates`, `reports/{id}/confirmations`, `announcements`, and `users/{uid}/notifications`.

## Setup

1. Create a Firebase project and Web app in Firebase Console.
2. Enable **Email/Password** under Authentication.
3. Copy Web App configuration into `js/firebase-config.js`; never place an Admin SDK key in the browser.
4. Install the CLI and log in: `npm install -g firebase-tools` then `firebase login`.
5. From this folder run `firebase use --add`, then deploy: `firebase deploy --only firestore:rules,firestore:indexes,storage` and `firebase deploy --only hosting`.
6. Add active barangay and category documents through a secure admin workflow. The registration demo options must be replaced with a Firestore-backed list before production.

For local testing: `firebase emulators:start`. Add `connectAuthEmulator`, `connectFirestoreEmulator`, and `connectStorageEmulator` in `js/firebase.js` only for local development.

## Secure role bootstrap

Use Firebase Admin SDK in a trusted server script or controlled Cloud Function to set claims, e.g. `admin.auth().setCustomUserClaims(uid, { role: 'admin' })`. Assign officials similarly with `{ role: 'official', barangayId: '...' }`, then force a new sign-in. Never allow registration to set these claims or trust a client-supplied role.

## Important production work

Wire photo upload with client-side image compression and resumable Storage uploads before enabling report submission. Increment `confirmationCount`, create notifications, issue sequential tracking numbers, and audit official actions through Cloud Functions/transactions—not arbitrary client writes. Enable App Check, establish retention/backups, apply rate limits and moderation review, test rules in Emulator Suite, and replace the privacy-contact placeholder with barangay-approved language. Map integration is optional: add a configured provider key server-side/environmentally; never map a registered home address.

## Security checklist

Rules prevent public reads of private profiles, role escalation, citizen status/priority changes, cross-barangay official updates, and non-image/oversize uploads. Test these cases in Emulator Suite before launch. Firestore rules are not filters: always query only public-safe `reports` fields and paginate with `limit()` / cursors.
