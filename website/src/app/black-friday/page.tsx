import { redirect } from "next/navigation";
import { BLACK_FRIDAY_ACTIVE } from "@/utils/pricing";

export default function BlackFridayPage() {
  redirect(BLACK_FRIDAY_ACTIVE ? "/pricing#black-friday" : "/pricing");
}
