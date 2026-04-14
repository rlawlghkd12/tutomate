import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "bg-error-subtle text-error hover:opacity-90",
        outline: "border border-border text-foreground",
        success: "bg-success-subtle text-success hover:opacity-90",
        warning: "bg-warning-subtle text-warning hover:opacity-90",
        info: "bg-info-subtle text-info hover:opacity-90",
        error: "bg-error-subtle text-error hover:opacity-90",
        purple: "bg-[hsl(263,70%,50%/0.12)] text-[hsl(263,70%,40%)] hover:opacity-90",
        orange: "bg-warning-subtle text-warning hover:opacity-90",
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
