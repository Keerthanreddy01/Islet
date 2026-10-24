import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "fixed",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(18, 19, 24, 0.96)",
            color: "#fff",
            padding: "8px 16px",
            borderRadius: 24,
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            border: "1px solid rgba(255, 69, 58, 0.4)",
            zIndex: 999999,
            cursor: "pointer",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
          }}
          onClick={() => this.setState({ hasError: false, error: null })}
          title="Click to reload island"
        >
          <span style={{ color: "#ff453a", fontWeight: 600 }}>Islet Recovered</span>
          <span style={{ opacity: 0.7 }}>Click to refresh</span>
        </div>
      );
    }

    return this.props.children;
  }
}
