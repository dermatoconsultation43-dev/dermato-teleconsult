import { Router } from "express";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin, requireAdminRole } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import {
  changeStatusSchema,
  consultationIdParamsSchema,
  deleteConsultationSchema,
  listAdminConsultationsQuerySchema,
  photoIdParamsSchema,
  updateAppointmentSchema,
} from "./admin.schemas.js";
import { consultationDraftSchema } from "../consultations/consultations.schemas.js";
import { sendMessageBodySchema } from "../messages/messages.schemas.js";
import {
  changeConsultationStatus,
  deleteConsultation,
  getAdminConsultationDetail,
  getAdminPhotoStream,
  getAdminStats,
  listAdminConsultations,
  listAdminMessages,
  sendAdminMessage,
  updateAppointment,
  updateConsultationFields,
} from "./admin.service.js";

export const adminRouter = Router();

// requireAdmin seul (pas requireAdminRole) : /me doit rester accessible aux deux
// rôles — c'est cet appel qui, côté mobile, permet à un compte agent terrain de
// savoir qu'il est bien connecté et vers quel espace se diriger (voir
// RootNavigator.tsx). Chaque route au-delà ajoute requireAdminRole pour se
// réserver au vrai rôle admin.
adminRouter.use(authenticate, requireAdmin);

adminRouter.get("/me", (req, res) => {
  res.json(req.auth!.admin);
});

adminRouter.use(requireAdminRole);

adminRouter.get("/stats", async (req, res, next) => {
  try {
    res.json(await getAdminStats());
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/consultations", validate({ query: listAdminConsultationsQuerySchema }), async (req, res, next) => {
  try {
    const items = await listAdminConsultations(req.query as never);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/consultations/:id", validate({ params: consultationIdParamsSchema }), async (req, res, next) => {
  try {
    const consultation = await getAdminConsultationDetail(req.params.id);
    res.json(consultation);
  } catch (error) {
    next(error);
  }
});

adminRouter.get(
  "/consultations/:id/photos/:photoId/view",
  validate({ params: photoIdParamsSchema }),
  async (req, res, next) => {
    try {
      const { stream, mimeType } = await getAdminPhotoStream(req.params.id, req.params.photoId);
      res.setHeader("Content-Type", mimeType);
      stream.on("error", next).pipe(res);
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.get(
  "/consultations/:id/messages",
  validate({ params: consultationIdParamsSchema }),
  async (req, res, next) => {
    try {
      const messages = await listAdminMessages(req.params.id);
      res.json({ items: messages });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.post(
  "/consultations/:id/messages",
  validate({ params: consultationIdParamsSchema, body: sendMessageBodySchema }),
  async (req, res, next) => {
    try {
      const message = await sendAdminMessage(req.auth!.admin!.id, req.params.id, req.body.body);
      res.status(201).json(message);
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  "/consultations/:id/fields",
  validate({ params: consultationIdParamsSchema, body: consultationDraftSchema }),
  async (req, res, next) => {
    try {
      const consultation = await updateConsultationFields(req.params.id, req.body);
      res.json(consultation);
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  "/consultations/:id/status",
  validate({ params: consultationIdParamsSchema, body: changeStatusSchema }),
  async (req, res, next) => {
    try {
      const consultation = await changeConsultationStatus(req.auth!.admin!.id, req.params.id, req.body);
      res.json(consultation);
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.delete(
  "/consultations/:id",
  validate({ params: consultationIdParamsSchema, body: deleteConsultationSchema }),
  async (req, res, next) => {
    try {
      const consultation = await deleteConsultation(req.params.id, req.body.reason);
      res.json({ success: true, consultation });
    } catch (error) {
      next(error);
    }
  },
);

adminRouter.patch(
  "/consultations/:id/appointment",
  validate({ params: consultationIdParamsSchema, body: updateAppointmentSchema }),
  async (req, res, next) => {
    try {
      const appointment = await updateAppointment(req.params.id, req.body, req.auth!.admin!.id);
      res.json(appointment);
    } catch (error) {
      next(error);
    }
  },
);
