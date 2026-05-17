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
        success:     "bg-muted text-foreground",
        warning:     "bg-[#FF9500] text-white dark:bg-[#FF9F0A]",
        error:       "bg-[#FF3B30] text-white dark:bg-[#FF453A]",
        destructive: "bg-[#FF3B30] text-white dark:bg-[#FF453A]",
        info:        "bg-[#007AFF] text-white dark:bg-[#0A84FF]",
        purple:      "bg-[#AF52DE] text-white dark:bg-[#BF5AF2]",
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
