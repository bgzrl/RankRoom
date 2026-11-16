import { z } from 'zod';
import { ROOM_CODE_REGEX } from './room-code.js';
import type { RatingScale, RoomSettings } from './types.js';

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  timeLimitSeconds: 30,
  revealBetweenItems: true,
  itemOrder: 'random',
  ratingScale: 'integers',
  itemCount: null,
  avoidRepeats: true,
};

export const UuidSchema = z.string().uuid('Identifiant UUID invalide.');

export const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(ROOM_CODE_REGEX, 'Le code de salle doit contenir 5 caractères valides (ex: K7M2P).');

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1, 'Le pseudo est requis.')
  .max(24, 'Le pseudo ne doit pas dépasser 24 caractères.');

export const RatingScaleSchema = z.enum(['integers', 'half_stars']);
export const ItemOrderSchema = z.enum(['sequential', 'random']);
export const TimeLimitSecondsSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
  z.null(),
]);
export const ItemCountSchema = z
  .number()
  .int("Le nombre d'items doit être un entier.")
  .min(1, "La manche doit contenir au moins 1 item.")
  .max(60, "Le nombre d'items par manche ne peut pas dépasser 60.")
  .nullable();

export const RoomSettingsSchema = z.object({
  timeLimitSeconds: TimeLimitSecondsSchema,
  revealBetweenItems: z.boolean(),
  itemOrder: ItemOrderSchema,
  ratingScale: RatingScaleSchema,
  itemCount: ItemCountSchema,
  avoidRepeats: z.boolean(),
});

export const PartialRoomSettingsSchema = RoomSettingsSchema.partial();

export const SafeImagePathSchema = z
  .string()
  .trim()
  .max(500, "Le chemin d'image est trop long.")
  .refine(
    (val) => {
      if (val === '') return true;
      if (val.includes('..')) return false;
      if (val.startsWith('/uploads/')) {
        return /^\/uploads\/[a-zA-Z0-9._-]+$/.test(val);
      }
      try {
        const parsed = new URL(val);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: "Chemin ou URL d'image invalide." },
  );

export const ThemeItemInputSchema = z.object({
  id: UuidSchema.optional(),
  name: z
    .string()
    .trim()
    .min(1, "Le nom de l'item est requis.")
    .max(80, "Le nom de l'item ne doit pas dépasser 80 caractères."),
  description: z
    .string()
    .trim()
    .max(200, "La description de l'item ne doit pas dépasser 200 caractères.")
    .default(''),
  imagePath: SafeImagePathSchema.default(''),
});

export const CreateThemeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Le titre du thème doit contenir au moins 3 caractères.')
    .max(80, 'Le titre du thème ne doit pas dépasser 80 caractères.'),
  description: z
    .string()
    .trim()
    .max(280, 'La description du thème ne doit pas dépasser 280 caractères.')
    .default(''),
  category: z
    .string()
    .trim()
    .min(2, 'La catégorie doit contenir au moins 2 caractères.')
    .max(40, 'La catégorie ne doit pas dépasser 40 caractères.'),
  items: z
    .array(ThemeItemInputSchema)
    .min(3, 'Un thème doit contenir au moins 3 items.')
    .max(60, 'Un thème ne peut pas dépasser 60 items.'),
});

export const UpdateThemeSchema = CreateThemeSchema;

export const ImportThemeSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().optional(),
  theme: z.object({
    title: CreateThemeSchema.shape.title,
    description: CreateThemeSchema.shape.description,
    category: CreateThemeSchema.shape.category,
    items: z
      .array(
        z.object({
          name: ThemeItemInputSchema.shape.name,
          description: ThemeItemInputSchema.shape.description,
          imagePath: SafeImagePathSchema.default(''),
        }),
      )
      .min(3, 'Le thème importé doit contenir au moins 3 items.')
      .max(60, 'Le thème importé ne peut pas dépasser 60 items.'),
  }),
});

export const UploadFromUrlSchema = z.object({
  url: z
    .string()
    .trim()
    .url('URL invalide.')
    .refine(
      (val) => {
        try {
          const parsed = new URL(val);
          return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
          return false;
        }
      },
      { message: 'Seules les URLs http:// et https:// sont autorisées.' },
    ),
});

export const SearchImagesQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'La recherche doit contenir au moins 2 caractères.')
    .max(120, 'La requête ne doit pas dépasser 120 caractères.'),
});

export const VerifyAdminPasswordSchema = z.object({
  password: z.string().min(1, 'Le mot de passe est requis.'),
});

export const RoomCreatePayloadSchema = z.object({
  displayName: DisplayNameSchema,
  themeId: UuidSchema,
  settings: PartialRoomSettingsSchema.optional(),
});

export const RoomJoinPayloadSchema = z.object({
  roomCode: RoomCodeSchema,
  displayName: DisplayNameSchema,
});

export const EmptyPayloadSchema = z.object({}).strict();

export const RoomUpdateSettingsPayloadSchema = z
  .object({
    themeId: UuidSchema.optional(),
    settings: PartialRoomSettingsSchema.optional(),
  })
  .refine((val) => val.themeId !== undefined || val.settings !== undefined, {
    message: 'Au moins un paramètre ou thème doit être fourni.',
  });

export const GameVotePayloadSchema = z.object({
  itemId: UuidSchema,
  score: z
    .number()
    .min(0.5, 'La note minimale est 0.5.')
    .max(5, 'La note maximale est 5.')
    .refine((val) => Math.abs(val * 2 - Math.round(val * 2)) < 1e-9, {
      message: 'La note doit être un multiple de 0.5.',
    }),
});

export const GameKickPlayerPayloadSchema = z.object({
  targetPlayerId: UuidSchema,
});

export function isValidScoreForScale(score: number, scale: RatingScale): boolean {
  if (!Number.isFinite(score)) return false;
  if (scale === 'integers') {
    return Number.isInteger(score) && score >= 1 && score <= 5;
  }
  return score >= 0.5 && score <= 5 && Math.abs(score * 2 - Math.round(score * 2)) < 1e-9;
}

export function getAllowedScoresForScale(scale: RatingScale): readonly number[] {
  if (scale === 'integers') {
    return [1, 2, 3, 4, 5];
  }
  return [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
}
