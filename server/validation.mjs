import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(32),
  password: z.string().min(8).max(128)
});

export const memberRegistrationSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_.-]+$/),
  password: z.string().min(8).max(128)
});

export const applicationSchema = z.object({
  age: z.coerce.number().int().min(13).max(99),
  desiredRole: z.string().trim().min(2).max(80),
  realName: z.string().trim().min(2).max(80),
  discordUsername: z.string().trim().min(2).max(80),
  motivation: z.string().trim().min(20).max(2000)
});

export const accountSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_.-]+$/),
  password: z.string().min(12).max(128),
  role: z.enum(["moderator", "admin"]).default("moderator")
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(12).max(128)
});

export const statusSchema = z.object({
  status: z.enum(["pending", "reviewing", "accepted", "rejected"])
});

export const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000)
});

export const noteSchema = z.object({
  body: z.string().trim().min(1).max(2000)
});

export function parse(schema, req, res) {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: "Certains champs sont invalides.",
      details: result.error.issues.map((issue) => issue.message)
    });
    return null;
  }
  return result.data;
}
