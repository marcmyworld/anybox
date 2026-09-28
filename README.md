# AnyBox 📦

A lightweight, modern web application built in pure HTML, CSS, and JavaScript designed for deployment on **Vercel**. AnyBox provides an interface to verify attestation service availability, decode the attestation payload, inspect certificate metadata, and download `keybox.xml`.

---

## ✨ Features

- **Service Status Monitoring**: Live health polling (`🟢🟢🟢 Active`), ping latency tracker, and timestamping.
- **Client-Side Decoding & Verification**: Decodes Base64 into XML directly in the browser via `TextDecoder` and validates the XML structure using `DOMParser`.
- **Metadata Inspector**:
  - Device Identifier tag extraction
  - Cryptographic key algorithms (ECDSA / RSA)
  - Total certificate chain count
  - File payload size (bytes / KB)
  - SHA-256 Checksum computation via Web Crypto API
- **User Actions**:
  - 📥 **Download `keybox.xml`**: Instant file download with correct MIME type.
  - 📋 **Copy XML / Base64 / SHA-256**: One-click clipboard actions with toast notifications.
  - 🔍 **Interactive XML Viewer**: Expandable code block for previewing the XML structure.
- **Privacy & Security Focused Architecture**:
  - Upstream URLs are managed entirely via server-side environment variables.
  - Frontend communicates exclusively through local relative endpoints (`/api/status` and `/api/keybox`).
  - Zero external endpoints or probing traffic exposed to browser clients or Developer Tools.

---

## ⚙️ Configuration (Environment Variables)

Configure the following environment variables in your **Vercel Dashboard** (under **Settings → Environment Variables**):

| Variable | Description | Example |
| :--- | :--- | :--- |
| `KEYBOX_SOURCE_URL` | Endpoint delivering the base64-encoded keybox | `https://your-source-provider.com/key` |
| `STATUS_SOURCE_URL` | Endpoint delivering the health/status string | `https://your-source-provider.com/status` |

For local testing, create a `.env.local` file (already in `.gitignore`):

```env
KEYBOX_SOURCE_URL=https://your-source-provider.com/key
STATUS_SOURCE_URL=https://your-source-provider.com/status
```

---

## 🚀 Deployment to Vercel

### Method 1: Deploy with Vercel CLI

1. Ensure the Vercel CLI is installed:
   ```bash
   npm i -g vercel
   ```
2. Run deployment from the repository root:
   ```bash
   cd /mnt/android-kitchen/anybox
   vercel
   ```
3. Add your environment variables when prompted or in the Vercel dashboard.

### Method 2: Git Import (GitHub / GitLab)

1. Push this repository to GitHub:
   ```bash
   git push origin main
   ```
2. Log into your [Vercel Dashboard](https://vercel.com).
3. Import the `anybox` repository.
4. Set `KEYBOX_SOURCE_URL` and `STATUS_SOURCE_URL` under Environment Variables.
5. Click **Deploy**.

---

## 📱 Applying to Android (TrickyStore)

1. Download `keybox.xml` from the web app.
2. Push the file to your device:
   ```bash
   adb push keybox.xml /data/adb/tricky_store/keybox.xml
   ```
3. Set restrictive permissions:
   ```bash
   adb shell "chmod 600 /data/adb/tricky_store/keybox.xml"
   ```
4. Verify target apps in `/data/adb/tricky_store/target.txt`:
   ```text
   com.google.android.gms!
   com.android.vending!
   com.google.android.gsf!
   ```
5. Restart Google Play Services:
   ```bash
   adb shell "killall -9 com.google.android.gms.unstable com.android.vending"
   ```
