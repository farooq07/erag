import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Thin wrapper over shadcn <Select> that keeps the original call-site API:
 *   options: string | { value, label?, dotClass? }
 * The optional color dot encodes department identity, so it's kept.
 */
export default function Dropdown({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select…",
  icon = null,
  className = "",
}) {
  const normalized = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : { label: o.value, ...o }
  );

  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn("h-8 gap-1.5 text-xs", className)}>
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {normalized.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            <span className="flex items-center gap-2">
              {o.dotClass && (
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", o.dotClass)} />
              )}
              {o.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
