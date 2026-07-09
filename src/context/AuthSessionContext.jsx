import { createContext, useContext } from "react";

/** Session + shell chrome shared by AuthenticatedLayout and child routes. */
const AuthSessionContext = createContext(null);

export function AuthSessionProvider({ value, children }) {
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const ctx = useContext(AuthSessionContext);
  if (!ctx) {
    throw new Error("useAuthSession must be used within AuthenticatedLayout");
  }
  return ctx;
}

/** Safe outside authenticated shell (e.g. shared components). */
export function useOptionalAuthSession() {
  return useContext(AuthSessionContext);
}
