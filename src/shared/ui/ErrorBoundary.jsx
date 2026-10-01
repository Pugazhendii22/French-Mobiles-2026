import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      info: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught an error:', error, info);
    this.setState({ info });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4 py-8">
          <div className="max-w-2xl w-full bg-white border border-red-200 shadow-xl rounded-3xl p-8 text-center">
            <h1 className="text-2xl font-bold text-red-700 mb-4">Something went wrong</h1>
            <p className="text-sm text-slate-600 mb-6">An unexpected error occurred while loading this page.</p>
            {this.state.error?.message && (
              <div className="text-left bg-red-50 border border-red-100 rounded-xl p-4 mb-6 overflow-x-auto text-xs text-red-700">
                <p className="font-semibold">Error:</p>
                <pre>{this.state.error.message}</pre>
              </div>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#002395] text-white text-sm font-semibold hover:bg-[#001a7a] transition"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
