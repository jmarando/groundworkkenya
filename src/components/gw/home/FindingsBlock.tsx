import { SoWhat } from "@/components/gw/findings/SoWhat";
import { useFindings } from "@/hooks/useFindings";
import { firstOfEach } from "@/lib/findings/core";

/**
 * Home's findings, right after Today: the first of each decision. When
 * Today's rival line is already the poll move, it isn't said twice.
 */
export function FindingsBlock({ today }: { today: string[] }) {
  const { data } = useFindings();
  if (!data) return null;
  const shown = firstOfEach(
    data.findings.filter(
      (f) => !(f.rule === "poll-move" && today.some((t) => f.line.startsWith(t))),
    ),
  );
  return (
    <div className="home-sec">
      <SoWhat title="What the numbers say" findings={shown} />
    </div>
  );
}
