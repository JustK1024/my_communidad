import { protectPage } from './auth.js';
import { firebaseReady, auth } from './firebase.js';

protectPage();
const $ = selector => document.querySelector(selector);

export function toast(text) {
  let element = $('.toast');
  if (!element) {
    element = document.createElement('div');
    element.className = 'toast';
    document.body.append(element);
  }
  element.textContent = text;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 3200);
}

const photoInput = $('#photos');
if (photoInput) {
  photoInput.addEventListener('change', () => {
    const files = [...photoInput.files];
    if (files.length > 5) {
      photoInput.value = '';
      toast('Choose no more than 5 photos.');
      return;
    }
    if (files.some(file => !file.type.startsWith('image/') || file.size > 8 * 1024 * 1024)) {
      photoInput.value = '';
      toast('Each photo must be an image smaller than 8 MB.');
      return;
    }
    const grid = $('#previews');
    grid.innerHTML = '';
    files.forEach(file => {
      const image = document.createElement('img');
      image.className = 'preview';
      image.alt = 'Selected report photo preview';
      image.src = URL.createObjectURL(file);
      image.addEventListener('load', () => URL.revokeObjectURL(image.src), { once: true });
      grid.append(image);
    });
  });
}

if ($('#location-button')) {
  $('#location-button').onclick = () => navigator.geolocation?.getCurrentPosition(
    position => {
      $('#latitude').value = position.coords.latitude.toFixed(6);
      $('#longitude').value = position.coords.longitude.toFixed(6);
      toast('Location added to this report.');
    },
    () => toast('Location unavailable. You can continue with the street and landmark.')
  );
}

if ($('#report-form')) {
  $('#report-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!firebaseReady || !auth.currentUser) {
      location.href = 'login.html';
      return;
    }
    if (!confirm('Submit this report to your barangay?')) return;

    const button = event.submitter || event.target.querySelector('button[type="submit"], button:not([type])');
    const originalText = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = 'Submitting…';
    }

    try {
      const form = new FormData(event.target);
      for (const file of [...(photoInput?.files || [])]) form.append('photos', file, file.name);
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to submit the report.');
      location.href = `report-details.html?id=${encodeURIComponent(result.id)}`;
    } catch (error) {
      toast(error.message || 'Unable to submit. Check your connection and try again.');
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  });
}
