-- AlterTable
ALTER TABLE "patients" ALTER COLUMN "telephone" DROP NOT NULL;

-- RenameIndex
ALTER INDEX "photos_gcs_object_path_key" RENAME TO "photos_drive_file_id_key";
