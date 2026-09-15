# Existing-brand standalone menu rollout

User-requested operational rollout on 2026-09-07

## Scope and result

Enabled the existing standalone menu publication feature for the 21 remaining non-deleted brands
Double B was already published and its flag was not rewritten
Total: 22 public menus and 676 tenant-scoped product cards
Ten brands have no products and display the existing empty state
Includes existing test accounts and suspended brands, as announced before activation
No catalog records, account statuses, subscriptions, schema or storage permissions changed
No new production build was needed because the generic route and administrator controls were already deployed
Other brands retain their generic branded menu presentation rather than inheriting Double B's identity or artwork

## Administrator controls

Open /admin/cafes as a platform administrator
Open the brand details and use the standalone menu section
The publication toggle and public link already render for every brand
Publish/stop mutations require platform administrator authorization and are scoped by brand UUID
Stopping a brand account does not stop its independent menu
Stopping publication denies fresh menu requests; already-open pages and previously issued signed media URLs can remain visible until refresh or expiry

## Verification

The scoped operational script has read-only default behavior and an explicit --apply flag
All 22 public routes returned HTTP 200 without redirects
Every route's product UUID set exactly matched that brand's eligible database product UUID set
Account statuses were compared before and after and remained unchanged
Standalone menu and feedback checks passed
Added mocked authorized publish/stop and invalid-input coverage alongside existing unauthorized action and tenant-isolation tests
TypeScript and text integrity checks passed
The available browser session belongs to a cafe owner rather than a platform administrator
Consequently authenticated administrator-button interaction could not be tested from that session
The admin shell's generic loading error was not bypassed and no account roles were elevated

## Public routes

| Brand | Menu | Products |
| --- | --- | ---: |
| Double B Bistro | https://barndaksa.com/menu/double-b-bistro | 51 |
| H9T | https://barndaksa.com/menu/h9t | 48 |
| Test zone | https://barndaksa.com/menu/test-zone | 45 |
| باب السقيفة | https://barndaksa.com/menu/bab-al-saqifah | 0 |
| بازيلكو | https://barndaksa.com/menu/basilico | 31 |
| تجربة الايميل | https://barndaksa.com/menu/test | 0 |
| تجربة الكوفي | https://barndaksa.com/menu/test-cafe | 141 |
| تجربة عمولة المندوب | https://barndaksa.com/menu/my-brand | 0 |
| دوبامين | https://barndaksa.com/menu/dobamin | 1 |
| زي الهوى | https://barndaksa.com/menu/loung-zie-alhwa | 45 |
| سهر 2 لاونج | https://barndaksa.com/menu/sahar2-loung | 0 |
| سهر لاونج 2 | https://barndaksa.com/menu/sahar-loung2 | 94 |
| شاهي وهيل | https://barndaksa.com/menu/shahi-w-hail | 29 |
| شاي باكر | https://barndaksa.com/menu/shay-baker | 0 |
| عشق روز | https://barndaksa.com/menu/eshiq-roz | 0 |
| فعالية برندة | https://barndaksa.com/menu/barnda-event | 0 |
| لاونج رشفة وجمرة | https://barndaksa.com/menu/rashfa-w-jamra | 65 |
| لاونج مكناس | https://barndaksa.com/menu/meknes-loung | 59 |
| مطاعم شواية سارة | https://barndaksa.com/menu/shawaya-sara | 0 |
| مطعم برندة | https://barndaksa.com/menu/barnda-resturant | 0 |
| مقهى كاث kath | https://barndaksa.com/menu/kat-coffe | 67 |
| ومس الكيف | https://barndaksa.com/menu/wans-alkif | 0 |

## Rollback

Before this rollout only Double B had a standalone_menu override, set to true
The other 21 targets had no override
Use the administrator stop action on an individual brand to unpublish it without affecting other brands
Do not rerun --apply after intentionally unpublishing a target unless republishing it is explicitly intended
