import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 py-[3px] text-[11px] font-medium leading-none whitespace-nowrap transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:     "bg-muted text-foreground",
        secondary:   "bg-muted text-muted-foreground",
        outline:     "bg-muted text-foreground",
        success:     "bg-muted text-muted-foreground",
        warning:     "bg-foreground/10 text-foreground font-semibold",
        error:       "bg-foreground text-background font-semibold",
        destructive: "bg-foreground text-background font-semibold",
        info:        "bg-muted text-foreground",
        purple:      "bg-muted text-foreground",
        orange:      "bg-foreground/10 text-foreground font-semibold",
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
