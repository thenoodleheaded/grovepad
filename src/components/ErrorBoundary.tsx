import { Component, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback: (retry: () => void) => ReactNode
  onError?: (error: unknown) => void
}

interface ErrorBoundaryState {
  error: unknown
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error)
  }

  retry = () => this.setState({ error: null })

  render() {
    if (this.state.error) return this.props.fallback(this.retry)
    return this.props.children
  }
}
