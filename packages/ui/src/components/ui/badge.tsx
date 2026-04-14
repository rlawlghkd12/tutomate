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
  "inline-flex items-center rounded-[3px] px-[7px] py-[3px] text-[11px] font-medium leading-none whitespace-nowrap transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        /* ── neutral ─────────────────────────────────────── */
        default:
          "bg-muted text-foreground",
        secondary:
          "bg-muted text-muted-foreground",
        outline:
          "border border-border text-foreground",

        /* ── semantic — contrast hierarchy ───────────────── */
        /** 완납 · 납부 · 모집 중: positive, fade into bg */
        success:
          "bg-muted text-muted-foreground",

        /** 부분납부 · 마감 임박: needs mild attention */
        warning:
          "border border-foreground/25 text-foreground font-semibold",

        /** 미납 · 정원 마감 · 긴급: inverted — most urgent */
        error:
          "bg-foreground text-background font-semibold",
        destructive:
          "bg-foreground text-background font-semibold",

        /** 일반 정보 */
        info:
          "bg-muted text-foreground",

        /** 기타 */
        purple:
          "bg-muted text-foreground font-medium",
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
