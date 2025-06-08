'use client'

import React from 'react'
import WebGLErrorFallback from './WebGLErrorFallback'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class WebGLErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('WebGL Error Boundary caught an error:', error, errorInfo)

    // Check if it's a WebGL-related error
    const isWebGLError =
      error.message.includes('WebGL') ||
      error.message.includes('webgl') ||
      error.message.includes('GL_') ||
      error.message.includes('context') ||
      error.stack?.includes('WebGLRenderer')

    if (isWebGLError) {
      console.warn('WebGL context error detected, switching to fallback mode')
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <WebGLErrorFallback error={this.state.error}>
          {this.props.children}
        </WebGLErrorFallback>
      )
    }

    return this.props.children
  }
}
