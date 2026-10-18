import { AlternativePage } from "@/components/AlternativePage";
import { unrollMeAlternative as alternative } from "@/utils/alternatives";
import { buildMetadata } from "@/utils/seo";

export const metadata = buildMetadata({
  title: `${alternative.name} Alternative`,
  description: alternative.metaDescription,
  path: `/${alternative.slug}`,
});

export default function UnrollMeAlternativePage() {
  return <AlternativePage alternative={alternative} />;
}
