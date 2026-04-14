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
        success:     "bg-success-subtle text-success",
        warning:     "bg-warning-subtle text-warning",
        error:       "bg-error-subtle text-error",
        destructive: "bg-error-subtle text-error",
        info:        "bg-info-subtle text-info",
        purple:      "bg-[hsl(263,70%,50%/0.12)] text-[hsl(263,70%,40%)]",
        orange:      "bg-warning-subtle text-warning",
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
