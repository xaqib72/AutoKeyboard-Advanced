# Build and Release

## Reproducible build

1. Install Node.js 20+, Rust stable/MSVC, Python 3.11+, and WebView2.
2. Run `npm ci`.
3. Run `npm run vision:build` to test and package the pinned OpenCV worker.
4. Run `npm run check`.
5. Run `npm run tauri build`.

The NSIS and MSI outputs are placed below `src-tauri/target/release/bundle`. The vision executable is copied into `vision/autokeyboard-vision.exe` inside the installed app and remains dormant until needed.

## Code signing

Production installers and the main executable should be Authenticode-signed with the publisher's certificate. Keep the certificate outside this repository and provide it through the release environment. Configure Tauri's Windows signing certificate thumbprint or signing command, timestamp with the certificate provider's RFC 3161 service, then verify with:

```powershell
Get-AuthenticodeSignature .\path\to\installer.exe | Format-List
```

This repository deliberately contains no private key or certificate. Local installers are therefore unsigned unless release credentials are supplied.

## Clean-machine acceptance

Test each signed release in fresh Windows 10 and Windows 11 VMs:

1. Install for the current user and launch from the Start menu.
2. Create, save, close, reopen, and run a keyboard/mouse/wait workflow.
3. Verify pause/resume and the global emergency stop from another application.
4. Save and reopen an `.akx` project with an image template; verify the lazy worker starts and matches.
5. Force-close with unsaved edits and verify recovery on restart.
6. Uninstall and confirm the program files are removed while user projects remain.

Record OS build, installer hash, signature status, WebView2 version, and pass/fail results with each release. This validation requires an external clean VM and signing identity; it cannot be certified by source tests alone.
