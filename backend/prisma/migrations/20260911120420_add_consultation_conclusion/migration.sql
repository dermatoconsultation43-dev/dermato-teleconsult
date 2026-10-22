-- AlterTable
ALTER TABLE "consultations" ADD COLUMN     "conclusion_drive_file_id" TEXT,
ADD COLUMN     "conclusion_medicale" TEXT,
ADD COLUMN     "conclusion_saved_at" TIMESTAMP(3),
ADD COLUMN     "conclusion_saved_by_admin_id" UUID;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_conclusion_saved_by_admin_id_fkey" FOREIGN KEY ("conclusion_saved_by_admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
