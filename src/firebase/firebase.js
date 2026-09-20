import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/* Vite inlines VITE_* at build time. If the host has no environment variables
   set, every value here is undefined and getAuth() throws while this module is
   still being imported - before React mounts, so the error boundary never runs
   and the user just gets a blank page. Say what is wrong instead. */
const missing = Object.entries(firebaseConfig)
    .filter(([, value]) => !value)
    .map(([key]) => `VITE_FIREBASE_${key.replace(/[A-Z]/g, c => '_' + c).toUpperCase()}`);

if (missing.length) {
    const message =
        'Firebase configuration is missing. Set the VITE_FIREBASE_* environment ' +
        'variables where this site is hosted, then redeploy.';
    console.error(message, '\nMissing:', missing.join(', '));

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', () => {
            const root = document.getElementById('root');
            if (root && !root.children.length) {
                root.innerHTML = `
                    <div style="font-family:system-ui,sans-serif;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#0f172a;">
                      <h1 style="font-size:1.1rem;font-weight:700;color:#ED2939;margin-bottom:.5rem;">
                        Configuration missing
                      </h1>
                      <p style="font-size:.9rem;line-height:1.6;color:#475569;">
                        This app cannot reach its database because its configuration was not
                        provided at build time. Set the Firebase environment variables in your
                        hosting project settings and deploy again.
                      </p>
                    </div>`;
            }
        });
    }

    throw new Error(`${message} Missing: ${missing.join(', ')}`);
}

const app = initializeApp(firebaseConfig);
const secondaryApp = initializeApp(firebaseConfig, "secondary");

export const db = getFirestore(app);
export const auth = getAuth(app);
export const secondaryAuth = getAuth(secondaryApp);
