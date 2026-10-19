import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-32" />
      <div className="grid gap-3 sm:grid-cols-2">
        {[1,2,3,4].map((i) => <Skeleton key={i} className="h-[120px] rounded-[8px]" />)}
      </div>
    </div>
  )
}
