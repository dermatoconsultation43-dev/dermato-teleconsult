import { z } from "zod";
import { ConsultationStatus } from "@prisma/client";

export const consultationIdParamsSchema = z.object({ id: z.string().uuid() });

export const listAdminConsultationsQuerySchema = z.object({
  status: z.nativeEnum(ConsultationStatus).optional(),
  search: z.string().trim().min(1).max(150).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const photoIdParamsSchema = z.object({ id: z.string().uuid(), photoId: z.string().uuid() });

export const changeStatusSchema = z.object({
  newStatus: z.nativeEnum(ConsultationStatus),
  reason: z.string().trim().max(1000).optional(),
  availabilityId: z.string().uuid().optional(),
  scheduledAt: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const deleteConsultationSchema = z.object({
  reason: z.string().trim().max(1000),
});

export const updateAppointmentSchema = z.object({
  availabilityId: z.string().uuid().optional(),
  scheduledAt: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const saveConclusionSchema = z.object({
  conclusion: z.string().trim().min(1, "La conclusion ne peut pas être vide.").max(5000),
});
