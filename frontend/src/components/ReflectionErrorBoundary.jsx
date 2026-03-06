import { Component } from "react";

export default class ReflectionErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (process.env.NODE_ENV !== "production") {
      console.error("ReflectionFlow crashed:", error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            padding: "40px 24px",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: "'Fraunces', serif",
              fontSize: "20px",
              color: "#2d3748",
              marginBottom: "12px",
            }}
          >
            Something went wrong.
          </p>
          <p
            style={{
              fontSize: "14px",
              color: "#718096",
              lineHeight: 1.6,
              marginBottom: "24px",
              maxWidth: "320px",
            }}
          >
            Your thought wasn't lost. Try starting a new reflection — we're looking into what happened.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              if (this.props.onReset) this.props.onReset();
            }}
            style={{
              padding: "12px 24px",
              borderRadius: "12px",
              background: "#2d3748",
              color: "white",
              fontSize: "14px",
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            Start fresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
