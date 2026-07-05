# LeetCommit - LeetCode to GitHub Sync Extension

![Manifest V3](https://img.shields.io/badge/Manifest-V3-00b8a3?style=for-the-badge&logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Privacy First](https://img.shields.io/badge/Privacy-100%25_Local-58a6ff?style=for-the-badge&logo=security&logoColor=white)
![GitHub REST API](https://img.shields.io/badge/GitHub-REST_API_v3-181717?style=for-the-badge&logo=github&logoColor=white)

LeetCommit ("LeetCode Sync") is a powerful, privacy-focused Chrome Extension built on Manifest V3 and TypeScript that automatically synchronizes your accepted LeetCode solutions directly to your GitHub repository.

Unlike other tools that rely on intermediate third-party backend servers or webhooks, LeetCommit operates 100% locally inside your browser. All communication happens directly between Chrome and api.github.com.

---

## Key Features

* **Instant Automatic Sync**: Detects accepted LeetCode submissions in real-time via network request monitoring and DOM mutation observers.
* **Clean Organized Structure**: Automatically organizes your code inside your GitHub repository by difficulty:
  ```text
  LeetCode/
  ├── Easy/
  │   └── 0001 - Two Sum.cpp
  ├── Medium/
  │   └── 0002 - Add Two Numbers.py
  └── Hard/
      └── 0004 - Median of Two Sorted Arrays.java
  ```
* **Dynamic README Index**: Automatically creates and updates a repository dashboard table showing total solved counts across Easy, Medium, and Hard difficulties.
* **Zero Third-Party Tracking**: Your GitHub Fine-Grained Personal Access Token is encrypted/stored strictly in Chrome local storage (chrome.storage.local). Zero telemetry or external analytics.
* **Smart Deduplication**: Computes code hashes to prevent redundant uploads when submitting duplicate solutions.
* **Sleek Dark Mode UI**: Includes an intuitive Popup dashboard showing sync statistics and a comprehensive Settings configuration interface.
* **Multi-Language Support**: Fully extracts and categorizes solutions across 9 core programming languages:
  * C++ (.cpp), Java (.java), Python (.py), JavaScript (.js), TypeScript (.ts), Go (.go), Rust (.rs), C# (.cs), Kotlin (.kt).

---

## How to Use (Quick Setup Guide)

1. **Install Extension**: Load the `/dist` folder in `chrome://extensions` with Developer Mode enabled.
2. **Open Settings**: Click the LeetCommit extension icon in your toolbar and click **Settings**.
3. **Connect Repository**: Click **1-Click Generate Token** shortcut, paste your full GitHub Repository URL and token.
4. **Solve & Sync**: Submit any passing solution on LeetCode. Your code, runtime ms, and space MB will upload automatically!

---

## System Architecture

LeetCommit operates on a direct, client-to-API communication model without intermediate servers.

### Data Flow & Component Interaction

1. **LeetCode Web Page (Extraction Layer)**
   * Injected Content Script monitors DOM state changes for Accepted status badges.
   * Network request interceptor captures GraphQL and API payloads to extract submitted source code, problem number, difficulty rating, programming language, and execution metrics.

2. **Chrome Extension Core (Orchestration & Storage Layer)**
   * Content Script transmits structured submission payloads to the ephemeral Background Service Worker via Chrome runtime message bus.
   * Storage Service securely manages user configuration, authentication credentials, and local SHA caching inside chrome.storage.local.

3. **GitHub REST API Client (Remote Sync Layer)**
   * Background Service Worker verifies local cache and resolves remote file SHAs to prevent collision conflicts.
   * Direct HTTPS PUT requests create or update solution files and update the root index directly inside the destination GitHub repository.

### Modular Codebase Organization

The codebase is structured into decoupled domain modules under src/:
* `src/background/`: Background service worker managing asynchronous sync queues and README generation.
* `src/content/`: DOM observers and network interceptors injected into LeetCode problem pages.
* `src/github/`: Type-safe REST API wrappers handling SHA resolution and rate limit backoffs.
* `src/storage/`: Typed wrappers around Chrome local storage caching problem metadata.
* `src/popup/` & `src/settings/`: Dark mode user interfaces for status inspection and token management.

---

## Local Setup & Chrome Installation

### 1. Prerequisites
* Node.js (v18+ recommended)
* npm (v9+)
* Google Chrome

### 2. Build the Extension
```bash
# Clone the repository
git clone https://github.com/abdullahx404/LeetCommit-LeetCodeExtension.git
cd LeetCommit-LeetCodeExtension

# Install dependencies
npm ci

# Compile production bundle
npm run build
```

### 3. Load in Google Chrome
1. Open Google Chrome and navigate to chrome://extensions/.
2. Enable **Developer mode** toggle in the top-right corner.
3. Click **Load unpacked** and select the generated /dist directory in this project folder.
4. Pin the LeetCommit icon to your browser toolbar.

---

## Configuration & GitHub Authentication

1. Click the LeetCommit extension icon and open the **Settings** gear icon (or right-click the extension icon -> Options).
2. Generate a **Fine-Grained Personal Access Token** on GitHub:
   * Go to **GitHub Settings -> Developer Settings -> Personal access tokens -> Fine-grained tokens**.
   * Set **Repository access** strictly to **Only select repositories** and pick your destination repository.
   * Under **Permissions -> Repository permissions**, set **Contents** to **Read and write**.
3. Paste your token, Repository Owner, and Repository Name into the LeetCommit Settings page and click **Test & Save**.

---

## Security & Privacy Policy

LeetCommit accesses only leetcode.com (to detect accepted submissions) and api.github.com (to upload source code files). No data is ever transmitted to any external analytics or proxy servers.

## License
MIT License. Created for the developer community.
