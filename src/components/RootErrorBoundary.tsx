"use client";

import React from "react";

/**
 * App-wide safety net. If any render throws (e.g. unexpected/corrupt persisted
 * state), this shows a friendly recovery screen instead of a white page — with a
 * one-click "Reset demo data" that clears localStorage and reloads. Critical for
 * a live client demo.
 */
interface State {
  hasError: boolean;
  error: Error | null;
}

export class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (typeof console !== "undefined") console.error("[RootErrorBoundary]", error, info);
  }

  private reset = () => this.setState({ hasError: false, error: null });

  private resetDemoData = () => {
    try {
      localStorage.removeItem("pph-state-v1");
      localStorage.removeItem("pph-team-target-v1");
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") window.location.href = "/";
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1.5rem", background: "#f6f7fb", color: "#14161f", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ maxWidth: 460, width: "100%", background: "#fff", border: "1px solid #e6e8f0", borderRadius: 20, padding: "1.75rem", textAlign: "center", boxShadow: "0 1px 3px rgba(20,22,31,0.06)" }}>
          <div style={{ fontSize: 28 }}>⚠️</div>
          <h1 style={{ margin: "0.5rem 0 0.25rem", fontSize: 20, fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ margin: "0 0 1.25rem", fontSize: 14, color: "#51566b" }}>
            The app hit an unexpected error. Try reloading; if it persists, reset the demo data to start fresh.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={this.reset}
              style={{ height: 40, padding: "0 16px", borderRadius: 9999, border: "1px solid #e6e8f0", background: "#fff", fontWeight: 500, cursor: "pointer" }}
            >
              Try again
            </button>
            <button
              onClick={this.resetDemoData}
              style={{ height: 40, padding: "0 16px", borderRadius: 9999, border: "none", background: "#6d49ff", color: "#fff", fontWeight: 600, cursor: "pointer" }}
            >
              Reset demo data
            </button>
          </div>
        </div>
      </div>
    );
  }
}
