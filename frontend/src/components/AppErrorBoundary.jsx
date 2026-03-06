import React from "react";

/**
 * Root-level Error Boundary for production.
 * Catches unhandled errors in the component tree and shows a fallback
 * so the app does not show a blank screen.
 */
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (process.env.NODE_ENV !== "production") console.error("AppErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen bg-[#FFFDF7] flex flex-col items-center justify-center p-6"
          role="alert"
        >
          <p className="text-[#4A5568] text-center text-lg mb-4">
            Something went wrong. Please restart Reflect.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-full text-sm font-medium bg-[#FFB4A9]/30 text-[#4A5568] hover:bg-[#FFB4A9]/40 transition-colors"
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default AppErrorBoundary;
