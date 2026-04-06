import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="auth-shell">
          <div className="auth-card">
            <h1>Something went wrong</h1>
            <p className="error">{this.state.error.message}</p>
            <p className="muted">
              Open the browser devtools console for details. If you meant to run
              the UI, use the Vite dev server (usually port 5173), not the API
              dev server on port 3000.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
