import { AlternativePage } from "@/components/AlternativePage";
import { leaveMeAloneAlternative as alternative } from "@/utils/alternatives";
import { buildMetadata } from "@/utils/seo";

export const metadata = buildMetadata({
  title: `${alternative.name} Alternative`,
  description: alternative.metaDescription,
  path: `/${alternative.slug}`,
});

export default function LeaveMeAloneAlternativePage() {
  return <AlternativePage alternative={alternative} />;
}
