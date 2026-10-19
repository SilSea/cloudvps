export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="text-[28px] font-bold text-text-primary tracking-tight">
          Quest<span className="text-primary">Cloud</span>
        </h1>
        <p className="text-sm text-text-secondary mt-1">VPS Cloud Rental Service</p>
      </div>
      <div className="w-full max-w-[420px]">{children}</div>
    </div>
  )
}
