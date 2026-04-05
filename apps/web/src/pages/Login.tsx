import { FormEvent, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function Login() {
  const { isDev, idToken, loading, error, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (isDev) {
    return <Navigate to="/" replace />;
  }
  if (!loading && idToken) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Sign-in failed");
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>NimbusTask</h1>
        <p className="muted">Sign in with your Cognito user</p>
        <form onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {(localError || error) && (
            <p className="error">{localError ?? error}</p>
          )}
          <button type="submit" disabled={loading}>
            {loading ? "…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
