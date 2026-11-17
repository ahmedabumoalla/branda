# MND WhatsApp invoice PDF fix (Claude) - LOCAL - 2026-11-18

The user reported that the MND invoice PDF sent to the customer's WhatsApp has four problems:
- no logo
- no QR code
- the title is "فاتورة مبيعات" instead of a simplified tax invoice
- empty boxes inside the amounts

## Root causes

1. **Logo.** MND stores its logo as an absolute platform URL. `receiptLogo` accepted only root paths or Supabase storage URLs, so it rejected the logo with `INVALID_RECEIPT_LOGO_ORIGIN`. The URL is:

   ```
   https://barndaksa.com/menu-art/dabab/dabab-hospital-logo-v1.webp
   ```

2. **QR code and tax title.** The queued SQL projection `customer_message_receipt` sends no `receiptSeller`, so the WhatsApp copy could never show the VAT number, the ZATCA QR or the simplified tax invoice title.

   MND itself has no tax number in `cafe_settings.tax_number`. Its VAT rate is 0, confirmed with a read-only query.

3. **Empty boxes.** The embedded Tajawal font has no glyphs for U+066B or U+066C, the Arabic decimal and thousands separators. Production Chromium has no fallback font, so these characters render as boxes.

## Change

Branch `fix/mind-whatsapp-invoice-20261118`, worktree `C:/Projects/branda-mind-invoice-20261118`, based on origin/main 40ec61aa. No database change.

`lib/data/finance-customer-receipt.ts`:
- Absolute `https://barndaksa.com` image URLs are now treated like local platform assets. The png/jpg/webp check and the size limits are unchanged.
- When the receipt carries no seller, the brand's current name and tax number are read with the service client. The seller is attached only when the tax number is valid, matching `^3[0-9]{13}3$`. This makes the PDF a simplified tax invoice with the ZATCA QR. Brands without a valid tax number keep the current copy.

`lib/export/finance-thermal-receipt-html.ts`:
- U+066B and U+066C are replaced with `.` and `,` in the PDF markup only.

## Checks

- Text integrity and full TypeScript pass.
- Local before/after render uses the same 80mm print settings with sample data. No message was sent and no records were created. The output is in:

  ```
  C:/مخرجات كلاود/فاتورة ميند الواتساب
  ```

## Needs from the user

- **Publication:** waiting for "انشر".
- **MND tax number:** for the QR and the simplified tax invoice title, MND must enter its VAT number in account settings and set its VAT rate. If MND is not VAT-registered, the copy stays a sales invoice by law.
