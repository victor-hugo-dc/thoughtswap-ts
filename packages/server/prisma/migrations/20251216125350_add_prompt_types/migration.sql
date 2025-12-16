-- AlterTable
ALTER TABLE "PromptUse" ADD COLUMN     "options" JSONB,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'TEXT';

-- AlterTable
ALTER TABLE "saved_prompts" ADD COLUMN     "options" JSONB,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'TEXT';
