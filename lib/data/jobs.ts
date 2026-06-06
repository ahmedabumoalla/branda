import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/data/cafes";

export type JobApplication = {
  id: string;
  fullName: string;
  birthDate: string;
  gender: string;
  experience: string;
  languages: string;
  region: string;
  phone: string;
  email: string;
  status: string;
  createdAt: string;
  cvUrl?: string;
};

const jobSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  birthDate: z.string().min(1),
  gender: z.enum(["male", "female"]),
  experience: z.string().trim().max(3000),
  languages: z.string().trim().min(1).max(500),
  region: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(8).max(20),
  email: z.string().trim().email(),
});

export async function submitJobApplication(input: {
  fullName: string;
  birthDate: string;
  gender: string;
  experience: string;
  languages: string;
  region: string;
  phone: string;
  email: string;
  cv: File;
}) {
  const parsed = jobSchema.parse(input);
  const file = input.cv;

  if (file.type !== "application/pdf" || file.size > 8 * 1024 * 1024) {
    throw new Error("ارفع السيرة الذاتية بصيغة PDF وبحجم لا يتجاوز 8MB");
  }

  const storagePath = `applications/${crypto.randomUUID()}.pdf`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("job-applications")
    .upload(storagePath, file, { contentType: "application/pdf", upsert: false });

  if (uploadError) throw uploadError;

  const { error } = await admin.from("job_applications").insert({
    full_name: parsed.fullName,
    birth_date: parsed.birthDate,
    gender: parsed.gender,
    experience: parsed.experience,
    languages: parsed.languages,
    region: parsed.region,
    phone: parsed.phone,
    email: parsed.email.toLowerCase(),
    cv_storage_path: storagePath,
    status: "new",
  });

  if (error) {
    await admin.storage.from("job-applications").remove([storagePath]);
    throw error;
  }
}

export async function getAdminJobApplications(): Promise<JobApplication[]> {
  await requirePlatformAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("job_applications")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const items: JobApplication[] = [];
  for (const row of data ?? []) {
    const { data: cv } = await admin.storage
      .from("job-applications")
      .createSignedUrl(String(row.cv_storage_path), 10 * 60);

    items.push({
      id: String(row.id),
      fullName: String(row.full_name),
      birthDate: String(row.birth_date),
      gender: String(row.gender),
      experience: String(row.experience ?? ""),
      languages: String(row.languages),
      region: String(row.region),
      phone: String(row.phone),
      email: String(row.email),
      status: String(row.status),
      createdAt: String(row.created_at),
      cvUrl: cv?.signedUrl,
    });
  }
  return items;
}

export async function updateJobApplicationStatus(id: string, status: string) {
  await requirePlatformAdmin();
  const parsed = z.enum(["new", "reviewing", "accepted", "rejected"]).parse(status);
  const supabase = await createClient();
  const { error } = await supabase
    .from("job_applications")
    .update({ status: parsed })
    .eq("id", id);
  if (error) throw error;
}
