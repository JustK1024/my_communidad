import { auth, db, firebaseReady } from './firebase.js';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  doc,
  serverTimestamp,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $ = selector => document.querySelector(selector);
const showMessage = text => {
  const element = $('.form-error');
  if (!element) return;
  element.textContent = text;
  element.classList.add('show');
};
const explain = error => ({
  'auth/email-already-in-use': 'This email already has an account.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
  'auth/weak-password': 'Choose a password with at least 8 characters.',
  'permission-denied': 'The database security rules have not been deployed yet.'
}[error.code] || 'We couldn’t complete that request. Please try again.');

if ($('#login-form')) {
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!firebaseReady) return showMessage('Firebase is not configured.');
    try {
      await signInWithEmailAndPassword(auth, $('#email').value.trim(), $('#password').value);
      location.href = 'dashboard.html';
    } catch (error) {
      showMessage(explain(error));
    }
  });
}

if ($('#forgot')) {
  $('#forgot').addEventListener('click', async event => {
    event.preventDefault();
    const email = $('#email').value.trim();
    if (!email) return showMessage('Enter your email first.');
    try {
      await sendPasswordResetEmail(auth, email);
      showMessage('Password reset email sent. Check your inbox.');
    } catch (error) {
      showMessage(explain(error));
    }
  });
}

if ($('#register-form')) {
  $('#register-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!firebaseReady) return showMessage('Firebase is not configured.');
    if ($('#password').value !== $('#confirm-password').value) return showMessage('Passwords do not match.');
    if (!$('#terms').checked || !$('#privacy').checked) return showMessage('Please accept the Terms and Privacy Notice.');

    let credential;
    try {
      credential = await createUserWithEmailAndPassword(auth, $('#email').value.trim(), $('#password').value);
      const uid = credential.user.uid;
      const barangayId = $('#barangay').value;
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', uid), {
        displayName: $('#display-name').value.trim(),
        barangayId,
        role: 'citizen',
        createdAt: serverTimestamp()
      });
      batch.set(doc(db, 'userPrivateProfiles', uid), {
        phone: $('#phone').value.trim(),
        address: $('#address').value.trim(),
        email: $('#email').value.trim(),
        barangayId,
        privacyAcceptedAt: serverTimestamp()
      });
      await batch.commit();
      location.href = 'dashboard.html';
    } catch (error) {
      if (credential?.user) await deleteUser(credential.user).catch(() => {});
      showMessage(explain(error));
    }
  });
}

document.querySelectorAll('[data-logout]').forEach(button => {
  button.onclick = async () => {
    if (firebaseReady) await signOut(auth);
    location.href = 'index.html';
  };
});

export function protectPage() {
  if (!firebaseReady) {
    location.href = 'login.html';
    return;
  }
  onAuthStateChanged(auth, user => {
    if (!user) location.href = 'login.html';
  });
}
