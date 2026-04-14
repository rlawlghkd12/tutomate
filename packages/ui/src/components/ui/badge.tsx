import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

/**
 * macOS-native badge — semantic meaning through contrast weight, not color.
 *
 * Contrast hierarchy (high → low):
 *   error/destructive  → inverted chip  (bg-foreground / text-background)
 *   warning            → bordered chip  (border-foreground/30 / text-foreground)
 *   success            → muted chip     (bg-muted / text-muted-foreground)
 *   secondary/info     → muted chip     (bg-muted / text-muted-foreground)
 *   default            → neutral chip
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium leading-none whitespace-nowrap transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:      "bg-muted text-foreground",
        secondary:    "bg-muted text-muted-foreground",
        outline:      "bg-muted text-foreground",
        success:      "bg-muted text-foreground",
        warning:      "bg-warning-subtle text-warning",
        error:        "bg-error-subtle text-error",
        destructive:  "bg-error-subtle text-error",
        info:         "bg-info-subtle text-info",
        purple:       "bg-[hsl(263,70%,50%/0.12)] text-[hsl(263,70%,40%)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
