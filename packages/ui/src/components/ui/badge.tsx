import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        error:
          "border-transparent bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] shadow hover:bg-[hsl(var(--destructive))]/80",
        warning:
          "border-transparent bg-[hsl(45,93%,47%)] text-[hsl(45,93%,10%)] shadow hover:bg-[hsl(45,93%,47%)]/80 dark:bg-[hsl(45,93%,47%)] dark:text-[hsl(45,93%,10%)]",
        success:
          "border-transparent bg-[hsl(142,71%,45%)] text-white shadow hover:bg-[hsl(142,71%,45%)]/80",
        purple:
          "border-transparent bg-[hsl(263,70%,50%)] text-white shadow hover:bg-[hsl(263,70%,50%)]/80",
        info:
          "border-transparent bg-[hsl(217,91%,60%)] text-white shadow hover:bg-[hsl(217,91%,60%)]/80",
        outline: "text-foreground",
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
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
