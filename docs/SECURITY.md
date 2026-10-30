# Security Policy

The Islet team takes the security of our application and users seriously. We appreciate your efforts to responsibly disclose any vulnerabilities.

## Supported Versions

Only the latest release on the `main` branch receives active security updates.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

**Please do not report security vulnerabilities via public GitHub issues, discussions, or pull requests.**

Instead, please report security issues through one of the following private channels:

1. **GitHub Private Vulnerability Advisory (Recommended):**
   - Navigate to the [Security Advisories](https://github.com/Keerthanreddy01/Islet/security/advisories) tab of the repository.
   - Click **Report a vulnerability** to open a confidential report directly to the maintainer.

2. **Direct Email:**
   - Send an email to the lead maintainer at **keerthan101011@gmail.com** with the subject `[SECURITY] Islet Vulnerability Report`.
   - Please include:
     - A description of the issue and potential impact.
     - Step-by-step reproduction instructions or a minimal proof of concept (PoC).
     - The operating system version and Islet release/commit hash where the vulnerability was observed.

## Response Process & Timeline

- **Acknowledgment:** We will acknowledge receipt of your vulnerability report within **48 hours**.
- **Assessment:** We will confirm the vulnerability, determine its severity, and discuss remediation steps with you.
- **Resolution:** A fix will be developed on a private branch, verified, and released in an updated version.
- **Disclosure:** We coordinate public release notes and credit the reporter after a patched release is published.

## Security Scope & Native OS Interactions

Islet is a desktop application combining **Electron**, **Node.js**, **React**, and **Windows PowerShell Runtime scripts** (for native GSMTC media playback and screen time metrics). Key security boundaries we maintain:
- Context isolation and secure IPC communication between renderer and main process.
- No execution of untrusted external code or unverified shell commands.
- Local system diagnostic logs are stored exclusively in user profile directories (`%APPDATA%/islet/islet.log`) without storing raw user credentials.
