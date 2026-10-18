import { AlternativePage } from "@/components/AlternativePage";
import { againstDataAlternative as alternative } from "@/utils/alternatives";
import { buildMetadata } from "@/utils/seo";

export const metadata = buildMetadata({
  title: `${alternative.name} Alternative`,
  description: alternative.metaDescription,
  path: `/${alternative.slug}`,
});

export default function AgainstDataAlternativePage() {
  return <AlternativePage alternative={alternative} />;
}
