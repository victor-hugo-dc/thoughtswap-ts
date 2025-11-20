-- CreateTable
CREATE TABLE "saved_prompts" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_prompts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "saved_prompts" ADD CONSTRAINT "saved_prompts_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
