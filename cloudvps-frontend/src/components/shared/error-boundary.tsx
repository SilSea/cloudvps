"use client"

import React from "react"
import { Button } from "@/components/ui/button"
import { AlertTriangle } from "lucide-react"

interface State {
  hasError: boolean
  message: string
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren<{ fallback?: React.ReactNode }>, State> {
  constructor(props: React.PropsWithChildren<{ fallback?: React.ReactNode }>) {
    super(props)
    this.state = { hasError: false, message: "" }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-secondary" />
          <div>
            <p className="font-medium text-text-primary">เกิดข้อผิดพลาด</p>
            <p className="text-sm text-text-secondary mt-1">{this.state.message}</p>
          </div>
          <Button
            variant="outline"
            className="rounded-[9999px]"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            ลองใหม่
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
