-- AlterTable
ALTER TABLE "consultations" ADD COLUMN     "admin_last_read_messages_at" TIMESTAMP(3),
ADD COLUMN     "patient_last_read_messages_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "consultation_id" UUID NOT NULL,
    "sender_type" "ChangedByType" NOT NULL,
    "sender_patient_id" UUID,
    "sender_admin_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_consultation_id_idx" ON "messages"("consultation_id");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_consultation_id_fkey" FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_patient_id_fkey" FOREIGN KEY ("sender_patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_admin_id_fkey" FOREIGN KEY ("sender_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
