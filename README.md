# AnyBox 📦

A lightweight, modern web application built in pure HTML, CSS, and JavaScript designed for deployment on **Vercel** or local execution via Node.js. AnyBox provides a unified, Material Design 3 interface to inspect, verify, and download Android hardware attestation `keybox.xml` payloads from open-source engines including **Specter** and **Integrity-Box**.

---

## ✨ Features

- **Multi-Source Attestation Engine**:
  - 👻 **Specter ([dpejoh/specter](https://github.com/dpejoh/specter))**: Live catalog integration (`rawbin.dpejoh.com`), smart auto-selection preferring active/non-softbanned candidates, specific provider selection, and custom alphabet substitution cipher decoding.
  - 🐱 **Integrity-Box ([MeowDump/Integrity-Box](https://github.com/MeowDump/Integrity-Box))**: Megatron payload integration with multi-layer decoding (10x Base64 &rarr; Hex &rarr; ROT13), fail-safe GitHub CDN IP routing, and live status verification.
  - ⚙️ **Custom Upstream**: Configurable custom endpoint fallback via environment variables.
- **Service Status Monitoring**: Live health polling per engine, ping latency tracker, and timestamping.
- **Client-Side Decoding & Verification**: Decodes Base64 into XML directly in the browser via `TextDecoder` and validates the XML structure using `DOMParser`.
- **Metadata Inspector**:
  - Attestation source & provider tags
  - Device Identifier tag extraction (`DeviceID`)
  - Cryptographic key algorithms (`ECDSA` / `RSA`)
  - Total certificate chain count
  - Certificate Serial and softban/revocation status
  - File payload size (bytes / KB)
  - SHA-256 Checksum computation via Web Crypto API
- **User Actions**:
  - 📥 **Download `keybox.xml`**: Instant file download with correct MIME type.
  - 📋 **Copy XML / Base64 / SHA-256**: One-click clipboard actions with toast notifications.
  - 🔍 **Interactive XML Viewer**: Expandable code block for previewing the XML structure.
- **Direct Terminal Download**: Direct endpoint access for root shell/Termux automation (`curl /api/keybox?format=xml`).
- **Privacy & Security Focused Architecture**:
  - All upstream communication is proxied through serverless `/api/` endpoints.
  - Zero external endpoints or probing traffic exposed to browser clients or Developer Tools.

---

## 🛠️ Supported Fetching Engines

### 1. Specter Engine
- **Catalog**: Queries `https://rawbin.dpejoh.com/catalog` to inspect active attestation candidates.
- **Selection**: Supports `Auto` (picks active, non-softbanned candidates from `workingEntries`) or targeting a specific provider (e.g. `@Xiaomi_Lei_Jun`, `KOW`, `Yuri`).
- **Cipher**: Deciphers the custom substitution cipher mapping `1dgWnocayqxU3r6vA5lCIPYfHmkV08b4tz+KMsp2NQ9LRXihODwSj7BEFJ/ZuGTe` to standard Base64 before decoding to XML.

### 2. Integrity-Box Engine
- **Payload**: Retrieves the Megatron payload from `https://raw.githubusercontent.com/MeowDump/MeowDump/refs/heads/main/Megatron`.
- **Fail-Safe Routing**: Automatically falls back to direct GitHub CDN IPs (`185.199.108.133`, `185.199.109.133`, etc.) with `Host: raw.githubusercontent.com` if DNS resolution fails.
- **Multi-Layer Decoding**: Executes 10 iterations of Base64 decoding, followed by Hex decoding, and finally ROT13 transformation to yield the raw `keybox.xml`.
- **Status Check**: Polls `https://raw.githubusercontent.com/MeowDump/Integrity-Box/refs/heads/main/keybox/key-status`.

### 3. Custom Upstream Engine
- Fetches raw XML or Base64 keybox payloads from arbitrary endpoints configured via `KEYBOX_SOURCE_URL`.

---

## 📡 API Endpoints

### 1. `GET /api/keybox`
Fetch an attestation keybox payload.

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `source` | `string` | `auto` | `specter`, `integritybox`, or `upstream` |
| `provider` | `string` | `auto` | Provider name (Specter engine), e.g. `KOW`, `@Xiaomi_Lei_Jun` |
| `version` | `string` | `null` | Provider version (Specter engine), e.g. `9`, `v5` |
| `format` | `string` | `json` | Set to `xml` to download `keybox.xml` directly |

**Example JSON Response**:
```json
{
  "base64": "PD94bWwgdmVyc2lvbj0iMS4wIj8+CjxBbmRyb2lkQXR0ZXN0YXRpb24...",
  "source": "specter",
  "provider": "@Xiaomi_Lei_Jun",
  "version": "v5",
  "serial": "15510740886364958753",
  "softbanned": false,
  "revoked": false,
  "latency": 245,
  "timestamp": "2026-09-28T12:00:00.000Z"
}
```

### 2. `GET /api/status`
Check service health and availability.

| Parameter | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `source` | `string` | `auto` | `specter`, `integritybox`, `upstream`, or `all` |

### 3. `GET /api/sources`
Returns available engines and live Specter provider catalog options.

---

## ⚙️ Configuration (Environment Variables)

Configure the following environment variables in your **Vercel Dashboard** or locally in `.env.local`:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `DEFAULT_SOURCE` | Default source engine (`specter`, `integritybox`, `upstream`) | `specter` |
| `KEYBOX_SOURCE_URL` | Endpoint for custom keybox provider | Optional |
| `STATUS_SOURCE_URL` | Endpoint for custom status health check | Optional |
| `SPECTER_CATALOG_URL` | Override Specter catalog endpoint | `https://rawbin.dpejoh.com/catalog` |
| `SPECTER_KEYBOX_URL` | Override Specter keybox endpoint | `https://rawbin.dpejoh.com/key` |
| `INTEGRITY_BOX_KEYBOX_URL` | Override MeowDump Megatron endpoint | `https://raw.githubusercontent.com/...` |
| `INTEGRITY_BOX_STATUS_URL` | Override MeowDump status endpoint | `https://raw.githubusercontent.com/...` |
| `PORT` | Local dev server port | `3000` |

---

## 🚀 Running Locally

AnyBox comes with a built-in zero-dependency development server:

```bash
cd /mnt/android-kitchen/anybox
npm start
# Server listening at http://localhost:3000
```

---

## 🚀 Deployment to Vercel

### Method 1: Deploy with Vercel CLI
```bash
cd /mnt/android-kitchen/anybox
vercel
```

### Method 2: Git Import (GitHub / GitLab)
1. Push this repository to your Git provider.
2. Import the project in your [Vercel Dashboard](https://vercel.com).
3. (Optional) Set `DEFAULT_SOURCE`, `KEYBOX_SOURCE_URL`, or `STATUS_SOURCE_URL`.
4. Click **Deploy**.

---

## 📱 Applying to Android (TrickyStore / TEESimulator)

### Option A: Direct Terminal Download (Termux / Root Shell)
Run from root shell on your Android device:
```bash
# Fetch directly from Specter engine
curl -sL "https://your-anybox-domain.vercel.app/api/keybox?format=xml&source=specter" -o /data/adb/tricky_store/keybox.xml
chmod 600 /data/adb/tricky_store/keybox.xml

# Or fetch from Integrity-Box engine
curl -sL "https://your-anybox-domain.vercel.app/api/keybox?format=xml&source=integritybox" -o /data/adb/tricky_store/keybox.xml
chmod 600 /data/adb/tricky_store/keybox.xml
```

### Option B: ADB Push
1. Download `keybox.xml` from the web app.
2. Push the file to your device:
   ```bash
   adb push keybox.xml /data/adb/tricky_store/keybox.xml
   adb shell "chmod 600 /data/adb/tricky_store/keybox.xml"
   ```
3. Verify target apps in `/data/adb/tricky_store/target.txt`:
   ```text
   com.google.android.gms!
   com.android.vending!
   com.google.android.gsf!
   ```
4. Restart Google Play Services:
   ```bash
   adb shell "killall -9 com.google.android.gms.unstable com.android.vending"
   ```
