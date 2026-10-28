# Barber55 cinematic male portrait

The owner requested a premium male model and haircut in place of the grooming tools. The Barber55 hero now uses a fictional adult model with a textured swept-back haircut, low fade and a neatly lined beard. Silver key light, restrained red rim light and deep navy preserve the salon identity

- Only the existing Barber55 tenant variant changes; other salons retain their original artwork
- New asset: `public/salon/barber-55/portrait-midnight.webp`, 1024x1536, 84,918 bytes
- Built-in image generation created the original portrait; Sharp only encoded it to WebP. The original tools asset is retained
- Desktop framing moves toward the face; mobile image gets reserved upper/lower space for the existing headline and booking controls
- Existing cinematic overlay, typography, booking, loyalty, logo and database settings remain intact
- Source stacking/responsive review and inspection of the generated portrait completed. No new browser inspection or handset screenshot was performed
- Mandatory TypeScript/text, scoped source ESLint, salon regression52, diff review and final Node24 Next16.3.8 Turbopack build are recorded in `output/barber55-portrait-verification.json`
- Publication receipt: `output/barber55-portrait-publication.json`; verify exact GitHub main/Vercel branda-2/apex/www and new asset before reporting published

## Generation prompt

> Create a premium cinematic editorial portrait photograph for Barber 55 men's grooming salon website, vertical 2:3 composition 1024x1536. One fictional adult male model about 30 years old, handsome Middle Eastern appearance, natural tan olive skin with authentic pores, striking masculine features, immaculate modern low skin-fade haircut with textured swept-back dark hair, precisely lined short beard. Three-quarter angle showing the beautiful fade on the side, eyes looking calmly off camera, confident understated expression. Wearing a matte black tailored shirt, head and shoulders only. Deep midnight navy #0b1220 background, cool silver softbox light from high left and a restrained crimson red rim light on the opposite edge, rich dimensional shadow, premium men's fragrance campaign photography, realistic fine hair details. CRITICAL WEB COMPOSITION: the top 40 percent of the full canvas is empty deep navy negative space for the site's logo and Arabic heading. Entire hairstyle starts around 43 percent of canvas height; face centered around 59 percent; face, hair, ears, beard entirely within the central 55 percent of canvas width so a narrow mobile crop preserves them. Shoulders taper into darkness at the bottom. Keep main head from 43 to 75 percent height, show the full haircut, no cut-off top of hair. Bottom 15 percent softly fades to the same deep navy for booking controls. Professional model visibly well groomed, elegant natural anatomy, photographic rather than illustrated. No text, no logos, no tools, no barber chairs, no watermark, no collage. This is a background portrait asset, not a screenshot or UI mockup.
