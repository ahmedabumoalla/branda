# BARNDAKSA_CUSTOMER_LOGIN_LOGO_REMOVE_PATCH

Removes the cafe/brand logo block from the customer login/register auth panel only.

Apply from project root:

```powershell
cd E:\branda-platform
powershell -ExecutionPolicy Bypass -File ".\BARNDAKSA_CUSTOMER_LOGIN_LOGO_REMOVE_PATCH\APPLY_CUSTOMER_LOGIN_LOGO_REMOVE.ps1" -ProjectPath "E:\branda-platform"
npm run build
npm run dev
```

Targeted file found by script:
- `themed-auth-panel.tsx` containing `ThemedAuthPanel` and `CafeLogo`

The script creates a `.bak-before-remove-customer-login-logo` backup before editing.
