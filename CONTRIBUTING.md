# Contributing to Islet

Thank you for your interest in contributing to **Islet**! We are delighted to welcome developers, designers, and enthusiasts from across the globe to help make Windows desktop multitasking fluid and delightful.

Please take a moment to review this document to ensure a smooth and productive collaboration process.

---

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please report any unacceptable behavior to **keerthan101011@gmail.com**.

---

## Project Governance & Maintainer Role

- **Repository Owner & Lead Maintainer**: [Keerthan Reddy (@Keerthanreddy01)](https://github.com/Keerthanreddy01) retains final decision-making authority over all architecture decisions, feature acceptance, pull request merges, versioning, and releases.
- **Contribution Model**: All external contributions are submitted through forks and pull requests. Direct pushes to the `main` branch are restricted.
- **Maintainer Review**: Every pull request requires review and approval from the lead maintainer before merging.

---

## Development Setup

### Prerequisites

- **Operating System**: Windows 10 (version 1903+) or Windows 11 (64-bit).
- **Node.js**: v18.0.0 or later (LTS recommended).
- **Package Manager**: npm (v9+ recommended).
- **PowerShell**: Windows PowerShell 5.1 or PowerShell 7 (used by native media/screentime workers).
- **Git**: Latest version installed and configured with your name and email.

### Getting the Code

1. Fork the repository on GitHub: [https://github.com/Keerthanreddy01/Islet](https://github.com/Keerthanreddy01/Islet)
2. Clone your personal fork locally:
   ```powershell
   git clone https://github.com/<your-username>/Islet.git
   cd Islet
   ```
3. Set upstream remote to track original repository:
   ```powershell
   git remote add upstream https://github.com/Keerthanreddy01/Islet.git
   ```
4. Install dependencies:
   ```powershell
   npm install
   ```

### Running Locally

To run Islet in live development mode with Vite Hot Module Replacement (HMR):

```powershell
npm run dev
```

The Islet capsule will launch anchored to the top-center of your primary display. You can interact with it, test hover expansion, media player sync, timer dials, and tool switches in real-time.

---

## Branching Model & Workflow

We follow a structured Git feature branch workflow:

1. **Keep `main` synced**:
   ```powershell
   git checkout main
   git fetch upstream
   git merge upstream/main
   ```

2. **Create a dedicated feature or bugfix branch**:
   Use descriptive, kebab-case branch names prefixed by category:
   - `feat/feature-name` (new capability or tool)
   - `fix/bug-description` (bug fix or defect resolution)
   - `perf/optimization-name` (performance or animation improvements)
   - `docs/documentation-update` (documentation fixes or additions)
   
   ```powershell
   git checkout -b feat/custom-timer-presets
   ```

3. **Make focused, atomic changes**:
   - Keep commits small, well-described, and logically grouped.
   - Follow standard Conventional Commit messages:
     - `feat: add custom quick timer intervals`
     - `fix: resolve slider jump on high DPI displays`
     - `docs: update build instructions for PowerShell execution policy`

---

## Coding Standards & Guidelines

1. **TypeScript First**:
   - Strict typing is enforced. Avoid `any` wherever possible.
   - All IPC messages between Electron main process and React renderer must be typed in [electron/ipc.ts](electron/ipc.ts).

2. **Design & UX Philosophy**:
   - **No UI Clutter**: Islet is an ambient, distraction-free companion. Minimalist aesthetics and fluid physics-based spring animations (via Framer Motion) are paramount.
   - **Windows Native Feel**: Respect system dark/light modes, native window behaviors, and smooth multi-monitor geometries.
   - **No Heavy Dependencies**: Keep the application lightweight. Avoid pulling in large runtime packages unless strictly necessary and discussed beforehand.

3. **Security & Privacy**:
   - **Never commit secrets, credentials, or personal local machine paths**.
   - The AI agent transcript adapter and media workers must strictly adhere to privacy boundaries (no logging of raw user prompts, private code snippets, or confidential paths).

---

## Testing & Verification

Before submitting any pull request, ensure all verification steps pass cleanly:

1. **Type Checking & Linting**:
   ```powershell
   npm run lint
   ```
   *Verifies both `tsconfig.json` (renderer React app) and `tsconfig.electron.json` (Electron main & background workers).*

2. **Code Formatting**:
   ```powershell
   npm run format
   ```
   *Formats the codebase with Prettier.*

3. **Production Build Verification**:
   ```powershell
   npm run build
   ```
   *Ensures the Vite client bundle and Electron worker bundles compile without errors or missing imports.*

4. **Installer Packaging (Optional, for release testing)**:
   ```powershell
   npm run dist
   ```

---

## Submitting a Pull Request (PR)

1. Push your branch to your GitHub fork:
   ```powershell
   git push -u origin feat/your-feature-name
   ```
2. Navigate to [https://github.com/Keerthanreddy01/Islet](https://github.com/Keerthanreddy01/Islet) and click **New Pull Request**.
3. Fill out the pull request template completely:
   - Describe what problem the PR solves or what feature it adds.
   - Include screenshots or screen recordings for any visual changes.
   - Reference any related issues (e.g., `Closes #12`).
   - Confirm that `npm run lint` and `npm run build` pass.
4. Keep pull requests focused: one feature or bugfix per PR makes reviews faster and safer.
5. Automated CI checks will run on your PR. If any checks fail, review the logs and update your branch.
6. The lead maintainer will review your pull request and provide feedback. Once all discussions and reviews are addressed, the PR will be merged into `main`.

Thank you for helping make Islet better!
