import * as React from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = React.ComponentProps<"button"> & {
  icon: React.ElementType;
  /** Swaps the icon for a spinner while the tile's work is in flight. */
  busy?: boolean;
};

/**
 * A dashed tile that opens an optional part of a form. As a child of a wrapping flex
 * row it sits two to a row, 48px tall like the sheet's other controls, and takes the
 * whole row once its sibling has expanded or there is no room for both.
 */
export function AddTile({ icon: Icon, busy, className, children, ...props }: Props) {
  const Shown = busy ? LoaderCircle : Icon;
  return (
    <button
      type="button"
      aria-busy={busy || undefined}
      className={cn(
        "flex h-12 min-w-32 flex-1 items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-secondary/30 px-3 text-sm font-bold text-muted-foreground outline-none transition active:scale-[.98]",
        "hover:border-primary/40 hover:bg-secondary/60 hover:text-primary focus-visible:border-primary/50 focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring/20",
        "disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
      {...props}
    >
      <Shown className={cn("size-4 shrink-0", busy && "animate-spin text-primary")} aria-hidden />
      <span className="truncate">{children}</span>
    </button>
  );
}
