import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-40" />
      {[1,2,3,4].map((i) => <Skeleton key={i} className="h-12 rounded-[8px]" />)}
    </div>
  )
}
