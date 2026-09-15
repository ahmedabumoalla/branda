import { redirect } from "next/navigation";

export default async function CustomerResetPasswordPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/c/${encodeURIComponent(slug)}/login`);
}
