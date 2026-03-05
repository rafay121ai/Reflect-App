import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("App error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          padding: 32,
          textAlign: "center",
          fontFamily: "inherit",
          color: "#4a5568",
        }}>
          <p style={{ fontSize: 18, marginBottom: 12 }}>
            Something went wrong.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px",
              borderRadius: 20,
              border: "1px solid #e2e8f0",
              background: "white",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
