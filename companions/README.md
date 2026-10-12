# Branda Pager native companions

These thin native shells load the production HTTPS pager using its existing authenticated sessions and server authorization. They do not implement a separate customer database or contain API keys. The `BrandaPagerNative/1.0` user-agent suffix selects compact presentation only; it never authorizes a request.

## Android

Requires Android 8 / API26 or later, an up-to-date Android System WebView, and user-granted display-over-other-apps permission. The foreground overlay service is user-started, non-exported and not sticky. It exposes a persistent close action, closes on screen lock, and never autostarts after boot. Notification permission is requested on Android13+. A visible notification is subject to that permission; Android may still show foreground-service controls when notifications are denied.

The overlay uses TYPE_APPLICATION_OVERLAY, supports dragging or selecting a corner, collapse/expand, keyboard interaction, owner/staff login, reload and explicit close. Its native toolbar's pager button opens the appropriate account route after login. Opening `brandapager://open` only opens the setup activity; incoming URI parameters are never loaded into the WebView.

Top-level navigation is restricted to HTTPS on barndaksa.com with the default/443 port and no userinfo. File/content access, third-party cookies, cleartext and mixed content are disabled. There is no JavaScript/native bridge and no TLS-error override. Backups/transfers are disabled. JavaScript remains enabled because the authenticated Next.js console requires it. Website subresources retain the site's existing CSP; top-level navigation restrictions are not an outbound-network firewall.

Build with JDK17+, Gradle9.3.1, Android Gradle Plugin9.1.0, Android SDK36 and Build Tools36.0.0:

```sh
gradle -p companions/android :app:assembleRelease :app:lintRelease
javac -encoding UTF-8 -d companions/android/build/navigation-tests companions/android/app/src/main/java/com/barndaksa/pager/TrustedNavigation.java companions/android/test/NavigationTest.java
java -cp companions/android/build/navigation-tests NavigationTest
```

The unsigned release output must be zipaligned and signed with the existing private Branda Pager release keystore before distribution. Preserve that identity for updates. The local signing identity and credentials are outside the repository under the machine user's `.codex/private/branda-pager-signing`; no signing secret is committed. Verify with `apksigner verify --verbose --print-certs` and record the SHA256 before updating the download.

Lint retains the reviewed JavaScript-enabled warning and the API36-versus-latest-target advisory; neither is suppressed. Targeting a later API should be accompanied by Android runtime compatibility testing.

## macOS

Requires macOS12 or later. The universal app includes arm64 and x86_64 executables built with native AppKit/WebKit. Its NSPanel is floating, accepts keyboard focus, remains visible when deactivated and joins desktop Spaces with full-screen auxiliary behavior. Window managers and fullscreen/security-sensitive applications may restrict overlays. Browser choice does not affect this independent app.

```sh
bash companions/macos/build.sh
```

The build verifies the universal bundle's ad-hoc signature, navigation rejection rules and opening/closing a real NSPanel on a macOS runner. It does not prove interaction above every POS application. The bundle is NOT Developer ID signed or notarized; Gatekeeper may require the user to review and allow it in Privacy & Security. Never disable Gatekeeper globally or claim Apple approval. Public deployment of a notarized edition requires an appropriate Developer ID identity; existing Wallet certificates are unrelated and must not be reused.

The GitHub macOS workflow builds artifacts on `codex/pager-native-*` branches or by manual dispatch. Published files live in `public/downloads` with version/checksum metadata. Do not republish a stale artifact after source changes.

## Verification limits and operation

An Android device was not attached during initial development. Overlay permission, real keyboard/focus behavior, OEM background restrictions, actual POS coexistence, and custom-protocol launch must be verified on the user's devices. Android payment apps or managed devices can disallow overlays. iPadOS is not supported by these native builds and has no equivalent general interactive overlay permission.

Signing/build success is not an installation or device test. No customer order or notification is sent by native build tests. Production application updates are loaded from the live site; native shell changes require a new signed installer.
