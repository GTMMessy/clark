import { redirect } from "next/navigation";
import { hasAccess } from "@/lib/access";
import { StoreApp } from "./store-app";

export default async function Store({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await hasAccess())) redirect(`/access?next=/store/${id}`);
  return <StoreApp id={id} />;
}
