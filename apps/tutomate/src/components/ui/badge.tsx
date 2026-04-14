import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center leading-none font-semibold transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        /* neutral */
        default:
          "rounded-[4px] bg-muted text-muted-foreground px-2 py-[3px] text-[11px]",
        secondary:
          "rounded-[4px] bg-secondary text-secondary-foreground px-2 py-[3px] text-[11px]",
        outline:
          "rounded-[4px] border border-border text-foreground px-2 py-[3px] text-[11px]",

        /* semantic — left-accent strip */
        success:
          "rounded-r-[4px] border-l-[3px] border-success bg-success-subtle text-success pl-[7px] pr-2 py-[3px] text-[11px]",
        warning:
          "rounded-r-[4px] border-l-[3px] border-warning bg-warning-subtle text-warning pl-[7px] pr-2 py-[3px] text-[11px]",
        error:
          "rounded-r-[4px] border-l-[3px] border-error bg-error-subtle text-error pl-[7px] pr-2 py-[3px] text-[11px]",
        destructive:
          "rounded-r-[4px] border-l-[3px] border-error bg-error-subtle text-error pl-[7px] pr-2 py-[3px] text-[11px]",
        info:
          "rounded-r-[4px] border-l-[3px] border-info bg-info-subtle text-info pl-[7px] pr-2 py-[3px] text-[11px]",
        purple:
          "rounded-r-[4px] border-l-[3px] border-[hsl(263,70%,50%)] bg-[hsl(263,70%,50%/0.10)] text-[hsl(263,70%,40%)] pl-[7px] pr-2 py-[3px] text-[11px]",
        orange:
          "rounded-r-[4px] border-l-[3px] border-warning bg-warning-subtle text-warning pl-[7px] pr-2 py-[3px] text-[11px]",
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
