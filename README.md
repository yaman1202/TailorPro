# TailorPro

TailorPro is an owner-authenticated tailoring business application built with React, Vite, Firebase Authentication, and Cloud Firestore. Firestore is the only supported repository for business data. The application does not fall back to LocalStorage or sample data if configuration, authentication, network access, or Firestore Rules prevent a cloud operation.

## Local development

1. Copy `.env.example` to `.env.local`.
2. Set the Firebase web app configuration values for the intended Firebase project.
3. Keep `VITE_DATA_REPOSITORY=firestore`. This setting is required; a missing value or any other value blocks repository initialization.
4. Start the app with `npm run dev`.

The `VITE_FIREBASE_*` values are public Firebase web-app configuration, not administrative credentials. Never put service-account keys or other private credentials in Vite environment variables.

The app requires the pre-provisioned owner account to sign in. It does not provide public registration. Business data is accessed at the fixed business path in `src/services/firebase/firebaseFirestore.js`; the owner identity is checked by Firestore Rules.

## Data safety and backups

LocalStorage is not read, modified, deleted, or migrated by the active application. Any previously saved browser data remains untouched. It must be exported using the existing TailorPro backup workflow and imported only through the explicit, validated Firestore restore flow. Restore is never automatic on login.

JSON backup/export and restore are supported through the existing repository. Cloud restore requires validation, owner confirmation, and transaction/write-limit preflight. If Firestore cannot safely commit the complete operation, it rejects the restore rather than silently chunking it.

## Tests and build

```sh
npm test
npm run test:firestore-rules
npm run test:storage-rules
npm run lint
npm run build
```

`npm run test:firestore-rules` runs the application’s Rules and repository integration tests against the local Firestore Emulator. `npm run test:storage-rules` verifies owner-only measurement-photo uploads and reads against the local Firestore and Storage Emulators. These tests do not access or modify production Firebase data.

## Deployment checklist

1. Provide the required `VITE_FIREBASE_*` variables and `VITE_DATA_REPOSITORY=firestore` to the build environment. Vite embeds these values at build time.
2. Run the tests and production build above.
3. Review both `firestore.rules` and `storage.rules` against the production business path and owner document, then run both emulator test suites.
4. Confirm the pre-provisioned owner document and owner UID in the Firebase Console without changing ownership.
5. Compare the reviewed Rules source with the currently deployed Rules. Rules deployment is a separate, manual action; this project does not deploy Rules automatically. When approved, the Firebase CLI command is:

   ```sh
   firebase deploy --only firestore:rules,storage --project tailorpro-dev-802c2
   ```

6. Configure Cloud Storage bucket CORS for the app origins in `cors.json` before using the authenticated `getBlob()` preview. Replace the production-domain placeholder with the exact deployed origin, then apply the file to the configured bucket:

   ```sh
   gcloud storage buckets update gs://tailorpro-dev-802c2.firebasestorage.app --cors-file=cors.json
   ```

7. On the first Storage Rules deployment, approve Firebase's cross-service Rules permission prompt so Storage Rules can read the owner document from Firestore. Then confirm the hosting provider serves the built `dist/` output over HTTPS and that the production domain is authorized in Firebase Authentication.
7. Test owner login and read/write operations using a dedicated test record or an approved production-safe procedure. Do not test by importing data or creating records in the business workspace without authorization.

Production Rules are not verified or changed by a local emulator test. If deployed Rules differ from `firestore.rules`, Firestore may reject application writes; TailorPro displays the failure and does not save to a local repository instead.
