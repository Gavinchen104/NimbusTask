import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  type CognitoUserSession,
} from "amazon-cognito-identity-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface AuthContextValue {
  isDev: boolean;
  idToken: string | null;
  email: string | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const isDev = import.meta.env.VITE_DEV_LOCAL_AUTH === "true";
  const [idToken, setIdToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isDev);
  const [error, setError] = useState<string | null>(null);

  const pool = useMemo(() => {
    if (isDev) return null;
    const id = import.meta.env.VITE_USER_POOL_ID;
    const clientId = import.meta.env.VITE_USER_POOL_CLIENT_ID;
    if (!id || !clientId) return null;
    return new CognitoUserPool({
      UserPoolId: id,
      ClientId: clientId,
    });
  }, [isDev]);

  useEffect(() => {
    if (isDev) {
      setLoading(false);
      return;
    }
    if (!pool) {
      setError("Set VITE_USER_POOL_ID and VITE_USER_POOL_CLIENT_ID");
      setLoading(false);
      return;
    }
    const user = pool.getCurrentUser();
    if (!user) {
      setLoading(false);
      return;
    }
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) {
        setLoading(false);
        return;
      }
      setIdToken(session.getIdToken().getJwtToken());
      const payload = session.getIdToken().payload as { email?: string };
      setEmail(payload.email ?? null);
      setLoading(false);
    });
  }, [isDev, pool]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      if (isDev || !pool) return;
      setError(null);
      const user = new CognitoUser({
        Username: username,
        Pool: pool,
      });
      const auth = new AuthenticationDetails({
        Username: username,
        Password: password,
      });
      await new Promise<void>((resolve, reject) => {
        user.authenticateUser(auth, {
          onSuccess: (session) => {
            setIdToken(session.getIdToken().getJwtToken());
            const payload = session.getIdToken().payload as { email?: string };
            setEmail(payload.email ?? username);
            resolve();
          },
          onFailure: (err) => reject(err),
        });
      });
    },
    [isDev, pool]
  );

  const signOut = useCallback(() => {
    if (isDev) return;
    pool?.getCurrentUser()?.signOut();
    setIdToken(null);
    setEmail(null);
  }, [isDev, pool]);

  const value: AuthContextValue = {
    isDev,
    idToken,
    email,
    loading,
    error,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth inside AuthProvider");
  return ctx;
}
