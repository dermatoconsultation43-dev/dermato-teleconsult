import { Router } from "express";
import { authenticate } from "../../middleware/auth.js";
import { requirePatient } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import { consultationIdParamSchema, sendMessageBodySchema } from "./messages.schemas.js";
import { listMessages, sendMessage } from "./messages.service.js";

// Monté sous /api/v1/consultations/:consultationId/messages — voir app.ts.
export const messagesRouter = Router({ mergeParams: true });

messagesRouter.use(authenticate, requirePatient);

messagesRouter.get("/", validate({ params: consultationIdParamSchema }), async (req, res, next) => {
  try {
    const messages = await listMessages(req.auth!.patient!.id, req.params.consultationId);
    res.json({ items: messages });
  } catch (error) {
    next(error);
  }
});

messagesRouter.post(
  "/",
  validate({ params: consultationIdParamSchema, body: sendMessageBodySchema }),
  async (req, res, next) => {
    try {
      const message = await sendMessage(req.auth!.patient!.id, req.params.consultationId, req.body.body);
      res.status(201).json(message);
    } catch (error) {
      next(error);
    }
  },
);
