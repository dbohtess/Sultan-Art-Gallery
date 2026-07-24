# Secure private sections — one-time Firebase setup

The website code is ready, but private sections intentionally do not fall back
to client-side PIN checking. Complete these one-time server steps before using
`PRIVATE` in Owner Mode.

1. Make sure Firebase project `sultan-art-gallery-2026` is on the Blaze plan.
   Firebase requires this plan to deploy Cloud Functions.
2. From this project folder, authenticate the Firebase CLI with the Google
   account that owns the Firebase project.
3. Store the Cloudinary server credentials in Firebase Secret Manager:

   ```text
   firebase functions:secrets:set CLOUDINARY_CONFIG
   ```

   Enter one JSON value in this form:

   ```json
   {"cloudName":"wqgyhwiu","apiKey":"YOUR_CLOUDINARY_API_KEY","apiSecret":"YOUR_CLOUDINARY_API_SECRET"}
   ```

4. Create a separate long random pepper for hashing 6-digit section codes:

   ```text
   firebase functions:secrets:set PRIVATE_SECTION_PIN_PEPPER
   ```

   Enter a new random value of at least 32 characters. Do not reuse the
   Cloudinary secret or the section PIN.
5. Deploy only the new server function and Firestore rules:

   ```text
   firebase deploy --only firestore:rules,functions:privateSectionApi
   ```

Never place either secret in `firebase-config.js`, frontend JavaScript, GitHub,
or a Firestore document. The public Firebase web configuration is expected to
remain public and is not a server credential.
