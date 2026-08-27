import type { TimeRange } from "@/lib/analytics-helpers";
import { Button } from "@/components/ui/button";

const OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

export function RangeToggle({ value, onChange }: { value: TimeRange; onChange: (v: TimeRange) => void }) {
  return (
    <div className="flex gap-2">
      {OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          size="sm"
          variant={value === opt.value ? "default" : "outline"}
          className="rounded-full"
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
