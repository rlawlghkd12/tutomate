import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-[5px] rounded-[4px] px-[7px] py-[3px] text-[11px] font-medium leading-none transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "bg-muted text-muted-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-error-subtle text-error",
        outline: "border border-border bg-transparent text-foreground",
        success: "bg-success-subtle text-success",
        warning: "bg-warning-subtle text-warning",
        info: "bg-info-subtle text-info",
        error: "bg-error-subtle text-error",
        purple: "bg-[hsl(263,70%,50%/0.12)] text-[hsl(263,70%,40%)]",
        orange: "bg-warning-subtle text-warning",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const DOT_VARIANTS = new Set<string>([
  "success", "warning", "error", "destructive", "info", "purple", "orange",
]);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, children, ...props }: BadgeProps) {
  const showDot = variant != null && DOT_VARIANTS.has(variant);
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {showDot && (
        <svg
          width="5"
          height="5"
          viewBox="0 0 5 5"
          fill="currentColor"
          className="shrink-0 opacity-75"
          aria-hidden="true"
        >
          <circle cx="2.5" cy="2.5" r="2.5" />
        </svg>
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
