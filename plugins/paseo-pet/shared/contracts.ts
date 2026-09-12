import { defineRpc, defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const MAX_ASSET_BYTES = 8 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 16 * 1024;
export const MAX_PETS = 128;
export const MAX_ENTRIES = 512;
export const CELL_WIDTH = 192;
export const CELL_HEIGHT = 208;
export const COLUMNS = 8;

export const versionSchema = z.union([z.literal(1), z.literal(2)]);
export const manifestSchema = z.looseObject({
  id: z.string().min(1).max(128),
  displayName: z.string().min(1).max(128),
  description: z.string().max(2048).default(""),
  spriteVersionNumber: versionSchema.default(1),
  spritesheetPath: z.string().min(1).max(1024),
});
export const packageKeySchema = z.string().min(1).max(255)
  .refine((key) => key !== "." && key !== ".." && !/[\\/:]/.test(key) && !Array.from(key).some((char) => char.charCodeAt(0) < 32), "Invalid package directory");
export const rootSchema = z.string().trim().max(4096);
export const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const petSchema = z.object({
  key: packageKeySchema,
  id: z.string(),
  displayName: z.string(),
  description: z.string(),
  version: versionSchema,
  mime: z.enum(["image/png", "image/webp"]),
  bytes: z.number().int().positive().max(MAX_ASSET_BYTES),
  revision: hashSchema,
});
export type Pet = z.output<typeof petSchema>;
export type SpriteVersion = z.output<typeof versionSchema>;
export const preferences = defineSettings({
  id: "pets",
  scope: "host",
  version: 1,
  schema: z.object({
    root: rootSchema.default(""),
    petKey: z.union([z.literal(""), packageKeySchema]).default(""),
    animate: z.boolean().default(true),
  }),
});
export const suggestRoot = defineRpc({
  name: "pets.suggest-root", input: z.object({}),
  output: z.object({ root: rootSchema }),
});
export const listPets = defineRpc({
  name: "pets.list", input: z.object({ root: rootSchema.min(1) }),
  output: z.object({
    root: rootSchema,
    pets: z.array(petSchema).max(MAX_PETS),
    issues: z.array(z.object({ key: z.string(), message: z.string() })).max(MAX_ENTRIES),
    truncated: z.boolean(),
  }),
});
export const loadPet = defineRpc({
  name: "pets.load",
  input: z.object({ root: rootSchema.min(1), key: packageKeySchema, revision: hashSchema }),
  output: z.object({
    pet: petSchema,
    hash: hashSchema,
    uri: z.string().max(Math.ceil(MAX_ASSET_BYTES / 3) * 4 + 32)
      .regex(/^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  }),
});
export type PetAsset = z.output<typeof loadPet.output>;
