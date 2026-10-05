import 'dotenv/config';

import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import express from 'express';
import admin from 'firebase-admin';
import { google } from 'googleapis';
import multer from 'multer';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const resolveFromRoot = value => path.resolve(root, value);
const oauthClientFile = resolveFromRoot(process.env.GOOGLE_OAUTH_CLIENT_FILE || 'secrets/google_oauth_client.json');
const serviceAccountFile = resolveFromRoot(process.env.FIREBASE_SERVICE_ACCOUNT_FILE || 'secrets/firebase-service-account.json');
const allowedPages = new Set([
  'index.html', 'login.html', 'register.html', 'dashboard.html', 'reports.html',
  'report.html', 'report-details.html', 'profile.html', 'privacy.html'
]);

function readJson(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} is missing: ${path.relative(root, file)}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const serviceAccount = readJson(serviceAccountFile, 'Firebase service account');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const firestore = admin.firestore();

const oauthFile = readJson(oauthClientFile, 'Google OAuth client');
const oauthConfig = oauthFile.web || oauthFile.installed;
if (!oauthConfig?.client_id || !oauthConfig?.client_secret) throw new Error('Google OAuth client JSON is invalid.');
if (!process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN.includes('replace_')) {
  throw new Error('GOOGLE_REFRESH_TOKEN is missing from .env.');
}

const oauth = new google.auth.OAuth2(oauthConfig.client_id, oauthConfig.client_secret);
oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth });

let cachedFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
async function getUploadFolderId() {
  if (cachedFolderId) return cachedFolderId;
  const marker = "appProperties has { key='mycommunidad' and value='report-images' }";
  const existing = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and trashed=false and ${marker}`,
    fields: 'files(id)',
    pageSize: 1
  });
  if (existing.data.files?.[0]?.id) {
    cachedFolderId = existing.data.files[0].id;
    return cachedFolderId;
  }
  const created = await drive.files.create({
    requestBody: {
      name: 'MyCommunidad Report Images',
      mimeType: 'application/vnd.google-apps.folder',
      appProperties: { mycommunidad: 'report-images' }
    },
    fields: 'id'
  });
  cachedFolderId = created.data.id;
  return cachedFolderId;
}

async function requireFirebaseUser(req, res, next) {
  const match = req.get('authorization')?.match(/^Bearer (.+)$/);
  if (!match) return res.status(401).json({ error: 'Authentication required.' });
  try {
    req.user = await admin.auth().verifyIdToken(match[1]);
    next();
  } catch {
    res.status(401).json({ error: 'Your session is invalid or expired.' });
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 5, fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, callback) {
    const allowed = file.mimetype.startsWith('image/');
    callback(allowed ? null : new Error('Only image files are allowed.'), allowed);
  }
});

const app = express();
app.disable('x-powered-by');
app.use('/css', express.static(path.join(root, 'css'), { dotfiles: 'deny' }));
app.use('/js', express.static(path.join(root, 'js'), { dotfiles: 'deny' }));

app.post('/api/reports', requireFirebaseUser, upload.array('photos', 5), async (req, res, next) => {
  const required = ['barangayId', 'category', 'title', 'description', 'street', 'landmark'];
  const missing = required.find(key => !String(req.body[key] || '').trim());
  if (missing) return res.status(400).json({ error: `Missing required field: ${missing}` });
  if (String(req.body.title).length > 100 || String(req.body.description).length > 1000) {
    return res.status(400).json({ error: 'The title or description is too long.' });
  }

  const uploadedIds = [];
  try {
    const folderId = await getUploadFolderId();
    for (const [index, file] of (req.files || []).entries()) {
      const extension = path.extname(file.originalname).slice(0, 12);
      const uploaded = await drive.files.create({
        requestBody: {
          name: `${req.user.uid}-${Date.now()}-${index + 1}${extension}`,
          parents: [folderId],
          appProperties: { mycommunidad: 'report-image', ownerUid: req.user.uid }
        },
        media: { mimeType: file.mimetype, body: Readable.from(file.buffer) },
        fields: 'id'
      });
      uploadedIds.push(uploaded.data.id);
    }

    const ref = firestore.collection('reports').doc();
    const year = new Date().getFullYear();
    const now = admin.firestore.FieldValue.serverTimestamp();
    await ref.set({
      trackingNumber: `MYC-${year}-${ref.id.slice(0, 6).toUpperCase()}`,
      userId: req.user.uid,
      barangayId: String(req.body.barangayId),
      categoryId: String(req.body.category),
      categoryName: String(req.body.category),
      title: String(req.body.title).trim(),
      description: String(req.body.description).trim(),
      street: String(req.body.street).trim(),
      landmark: String(req.body.landmark).trim(),
      latitude: req.body.latitude ? Number(req.body.latitude) : null,
      longitude: req.body.longitude ? Number(req.body.longitude) : null,
      driveFileIds: uploadedIds,
      status: 'submitted',
      priority: 'normal',
      confirmationCount: 0,
      visibility: 'public',
      createdAt: now,
      updatedAt: now
    });
    res.status(201).json({ id: ref.id });
  } catch (error) {
    await Promise.allSettled(uploadedIds.map(fileId => drive.files.delete({ fileId })));
    next(error);
  }
});

app.get('/api/report-images/:fileId', requireFirebaseUser, async (req, res, next) => {
  try {
    const metadata = await drive.files.get({ fileId: req.params.fileId, fields: 'mimeType,appProperties' });
    if (metadata.data.appProperties?.mycommunidad !== 'report-image') return res.sendStatus(404);
    res.type(metadata.data.mimeType || 'application/octet-stream');
    const image = await drive.files.get({ fileId: req.params.fileId, alt: 'media' }, { responseType: 'stream' });
    image.data.on('error', next).pipe(res);
  } catch (error) {
    next(error);
  }
});

app.get('/', (_req, res) => res.sendFile(path.join(root, 'index.html')));
app.get('/:page', (req, res, next) => {
  if (!allowedPages.has(req.params.page)) return next();
  res.sendFile(path.join(root, req.params.page));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  const message = error instanceof multer.MulterError ? error.message : 'The request could not be completed.';
  res.status(error instanceof multer.MulterError ? 400 : 500).json({ error: message });
});

app.listen(port, () => console.log(`MyCommunidad running at http://localhost:${port}`));
