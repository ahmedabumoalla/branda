# Arab mobile numbering metadata

`lib/auth/arab-phone-rules.ts` contains the 22 Arab League country calling codes,
national trunk prefixes, mobile national-number patterns and example numbers
extracted on 2026-11-24 from Google's libphonenumber project:

https://github.com/google/libphonenumber/blob/master/resources/PhoneNumberMetadata.xml

Copyright The Libphonenumber Authors. Licensed under Apache License 2.0, included
in `google-libphonenumber-LICENSE.txt` beside this file.

Local changes: Arabic country names and display placeholders added. Saudi Arabia
keeps the platform's existing `5\d{8}` validation to preserve existing accounts.
No new runtime dependency or complete global metadata bundle is included.

Local numbers use the selected/account country; only a complete valid international
number can infer a country. Staff numbers can explicitly use another supported
country. Customer loyalty identities retain their brand's country boundary.
No area-code, nationality, location, currency or tax regime is inferred from a phone.

When refreshing numbering rules, regenerate and compare the matching SQL private
rules, then run the cross-language parity and existing Saudi compatibility tests.
Examples are upstream fictional validation fixtures; tests never send messages.
