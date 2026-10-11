import { redirect } from "next/navigation";
import { hasAccess } from "@/lib/access";
import { NewStoreForm } from "./form";

export default async function NewStore() {
  if (!(await hasAccess())) redirect("/access?next=/new");
  return <NewStoreForm />;
}
