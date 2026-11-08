import type { CSSProperties } from "react";

export const HULM_MENU_SLUG = "brand-96f3dda4f1ea";

// Framing is tied to the reviewed immutable image, so a future upload is never magnified by mistake.
const framing: Record<string, { file: string; scale: number; originX?: number; originY?: number }> = {
  "5e17c4d7-2530-416c-883f-822bb536c9c8": {
    "file": "five-restaurants-hulm-20261103-88a0bffbbeb0ee5c.webp",
    "scale": 2.4,
    "originX": 43.42,
    "originY": 63.5
  },
  "9add7b9f-77e9-497f-843f-44dac3d381b1": {
    "file": "five-restaurants-hulm-20261103-6df9b4169b6cf535.webp",
    "scale": 2.8,
    "originX": 48.83,
    "originY": 64.71
  },
  "8ddc794d-99cb-446b-874c-b6ccf8f319e3": {
    "file": "five-restaurants-hulm-20261103-4ac73b18a1f95c6d.webp",
    "scale": 2.5,
    "originX": 46.84,
    "originY": 60.44
  },
  "d883a9d9-4660-48d4-80a4-80b7c8caf5ac": {
    "file": "five-restaurants-hulm-20261103-a2b59087e9c7d1de.webp",
    "scale": 1
  },
  "755539d8-63c0-4763-8a0e-7c4260e93019": {
    "file": "five-restaurants-hulm-20261103-65c3309b638a0b9b.webp",
    "scale": 3,
    "originX": 50.53,
    "originY": 70.26
  },
  "3b3e34c5-020e-40a0-81a1-6cc40ab170b6": {
    "file": "five-restaurants-hulm-20261103-070387515001eb59.webp",
    "scale": 2.8,
    "originX": 50.58,
    "originY": 60.32
  },
  "1b823129-4362-416f-8bb3-62c596e4cdb8": {
    "file": "five-restaurants-hulm-20261103-d2f69d7a1cb0b455.webp",
    "scale": 1
  },
  "936a68c6-a29b-4abf-8eef-6caeabf0807e": {
    "file": "five-restaurants-hulm-20261103-eac5d243d1f6835c.webp",
    "scale": 1
  },
  "a5726deb-6007-4cfe-8c13-824bac636d2b": {
    "file": "five-restaurants-hulm-20261103-fe71c4fb73772673.webp",
    "scale": 2.8,
    "originX": 46.78,
    "originY": 61.49
  },
  "f6f13fc0-6c18-426b-857d-d2996c468797": {
    "file": "five-restaurants-hulm-20261103-df264aeecd97c106.webp",
    "scale": 2.6,
    "originX": 47.7,
    "originY": 61.71
  },
  "e2a936cd-1415-4a35-8392-e20abad55605": {
    "file": "five-restaurants-hulm-20261103-c70414a876db1cfb.webp",
    "scale": 2.2,
    "originX": 46.49,
    "originY": 71.58
  },
  "4c688777-5954-4c1f-8ef1-f1674f4c99ca": {
    "file": "five-restaurants-hulm-20261103-8d0cc609e6afb308.webp",
    "scale": 1
  },
  "cae6c144-2e11-4534-8fa3-b118156051a1": {
    "file": "five-restaurants-hulm-20261103-acae4e6c76f8d456.webp",
    "scale": 2.2,
    "originX": 56.58,
    "originY": 65.44
  },
  "a8b5b71d-f01b-4656-81be-db2bf5e9e79c": {
    "file": "five-restaurants-hulm-20261103-1ad2692aa5004bb3.webp",
    "scale": 2.35,
    "originX": 42.67,
    "originY": 68.9
  },
  "bd177dd7-b22e-4e36-8d2c-1243a90823f1": {
    "file": "five-restaurants-hulm-20261103-00c8524ac8e83242.webp",
    "scale": 1
  },
  "7edee938-4395-4da4-8fa8-2c5595ed1938": {
    "file": "five-restaurants-hulm-20261103-529894f5e214ee69.webp",
    "scale": 1
  },
  "869d2b49-1eab-4b80-8294-311ec70014fe": {
    "file": "five-restaurants-hulm-20261103-cc44e57c8324bc30.webp",
    "scale": 1
  },
  "9ee57c80-f8f0-4a51-82ab-e85a6c9873a4": {
    "file": "five-restaurants-hulm-20261103-bb0073c739b556be.webp",
    "scale": 1.9,
    "originX": 48.25,
    "originY": 62.08
  },
  "29e5328f-adb2-4a49-85df-511a89440db5": {
    "file": "five-restaurants-hulm-20261103-395eb862ec2bf329.webp",
    "scale": 1.75,
    "originX": 47.19,
    "originY": 76.23
  },
  "6d9b5123-9325-4177-8439-d9671a600e5e": {
    "file": "five-restaurants-hulm-20261103-2fd374d5d0157604.webp",
    "scale": 1
  },
  "cbb9d6e2-98ba-4741-8434-8846240adf26": {
    "file": "five-restaurants-hulm-20261103-e32d83a80c806330.webp",
    "scale": 1
  }
};

export function hulmPhotoFraming(slug: string | undefined, productId: string, src: string | undefined): CSSProperties | undefined {
  if (slug !== HULM_MENU_SLUG || !src) return undefined;
  const frame = framing[productId];
  if (!frame) return undefined;
  let filename: string | undefined;
  try { filename = decodeURIComponent(src.split("?")[0]).split("/").at(-1); } catch { return undefined; }
  if (filename !== frame.file) return undefined;
  return { "--hulm-photo-scale": frame.scale, "--hulm-photo-origin-x": `${frame.originX ?? 50}%`, "--hulm-photo-origin-y": `${frame.originY ?? 65}%` } as CSSProperties;
}
