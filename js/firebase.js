import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig, firebaseReady } from './firebase-config.js';
export let auth, db;
if(firebaseReady){const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app)}
export { firebaseReady };
