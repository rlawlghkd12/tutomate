import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

/**
 * macOS-native solid capsule badge.
 * Apple HIG system colors — solid fill + white text for semantic states.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3.5 py-1.5 text-[0.786rem] font-semibold leading-none whitespace-nowrap transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:     "bg-muted text-foreground",
        secondary:   "bg-muted text-muted-foreground",
        outline:     "bg-muted text-foreground",
        success:     "bg-[hsl(142_64%_30%)] text-white",
        warning:     "bg-[hsl(35_88%_35%)] text-white",
        error:       "bg-[hsl(0_72%_45%)] text-white",
        destructive: "bg-[hsl(0_72%_45%)] text-white",
        info:        "bg-[hsl(217_60%_40%)] text-white",
        purple:      "bg-[hsl(265_35%_48%)] text-white",
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
