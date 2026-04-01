import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  fallback: (args: { error: Error; reset: () => void }) => ReactNode
}

type State = {
  error: Error | null
}

export class AsyncErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (error) return this.props.fallback({ error, reset: this.reset })
    return this.props.children
  }
}
